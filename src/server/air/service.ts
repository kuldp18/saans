import type { LocationId } from "../../catalog/cities";
import { delhiSample } from "../../catalog/delhi-demo";
import {
  AIR_STALE_MS, HOUR_MS, PLANNING_HORIZON_MS,
  airHourAt, isFreshAir, unavailableAir, type AirSnapshot, type RequestedAirMode,
} from "../../domain/air";

const RETRY_AFTER_FAILURE_MS = 30_000;
const MAX_CACHED_CITIES = 256;
type CacheEntry = {
  snapshot?: AirSnapshot;
  retryAt?: number;
  pending?: Promise<AirSnapshot | null>;
};

function coversPlanningHorizon(snapshot: AirSnapshot, now: number): boolean {
  const horizonEnd = now + PLANNING_HORIZON_MS;
  // The normalized live-model bins are sorted and start on UTC hours.
  let expected = Math.floor(now / HOUR_MS) * HOUR_MS;
  for (const { validAt } of snapshot.hourly) {
    const time = Date.parse(validAt);
    if (time < expected) continue;
    if (time > expected) return false;
    expected += HOUR_MS;
    if (expected >= horizonEnd) return true;
  }
  return false;
}

function usableRefresh(snapshot: AirSnapshot | null, cityId: LocationId, now: number): snapshot is AirSnapshot {
  return snapshot?.cityId === cityId && snapshot.mode === "live-model" && isFreshAir(snapshot, now) &&
    !!airHourAt(snapshot, now) &&
    snapshot.hourly.some(({ pm25UgM3, usAqi }) => pm25UgM3 !== null || usAqi !== null);
}

export function createAirService({ now, loadLive }: {
  now: () => number;
  loadLive?: (cityId: LocationId) => Promise<AirSnapshot | null>;
}) {
  const cache = new Map<LocationId, CacheEntry>();
  return async (cityId: LocationId, mode: RequestedAirMode): Promise<AirSnapshot> => {
    if (mode === "demo") return cityId === delhiSample.cityId ? delhiSample : unavailableAir(cityId);
    if (!loadLive) return unavailableAir(cityId);

    const readAt = now();
    let entry = cache.get(cityId);
    if (!entry) {
      if (cache.size >= MAX_CACHED_CITIES) {
        const oldest = cache.entries().find(([, candidate]) => !candidate.pending);
        if (!oldest) return unavailableAir(cityId);
        cache.delete(oldest[0]);
      }
      entry = {};
      cache.set(cityId, entry);
    }
    if (entry.snapshot && isFreshAir(entry.snapshot, readAt) && coversPlanningHorizon(entry.snapshot, readAt)) {
      return entry.snapshot;
    }

    if (!entry.pending && (entry.retryAt ?? -Infinity) <= readAt) {
      entry.pending = Promise.resolve()
        .then(() => loadLive(cityId))
        .catch(() => null)
        .then((result) => {
          const refreshedAt = now();
          if (!usableRefresh(result, cityId, refreshedAt)) {
            entry.retryAt = refreshedAt + RETRY_AFTER_FAILURE_MS;
            return null;
          }
          if (coversPlanningHorizon(result, refreshedAt)) {
            entry.snapshot = result;
            entry.retryAt = undefined;
          } else {
            entry.retryAt = refreshedAt + RETRY_AFTER_FAILURE_MS;
          }
          return result;
        })
        .finally(() => { entry.pending = undefined; });
    }

    const refreshed = await entry.pending;
    const readAfterRefresh = now();
    if (refreshed && airHourAt(refreshed, readAfterRefresh)) return refreshed;

    const previous = entry.snapshot;
    if (previous?.fetchedAt && airHourAt(previous, readAfterRefresh)) {
      const age = readAfterRefresh - Date.parse(previous.fetchedAt);
      if (age >= 0 && age <= AIR_STALE_MS) return { ...previous, mode: "stale-model" };
    }
    return unavailableAir(cityId);
  };
}
