import type { LocationId } from "../../catalog/cities";
import { delhiSample } from "../../catalog/delhi-demo";
import {
  AIR_STALE_MS, HOUR_MS, PLANNING_HORIZON_MS,
  airHourAt, isFreshAir, unavailableAir, type AirSnapshot, type RequestedAirMode,
} from "../../domain/air";

const RETRY_AFTER_FAILURE_MS = 30_000;
type CacheEntry = {
  snapshot?: AirSnapshot;
  retryAt?: number;
  pending?: Promise<AirSnapshot | null>;
};

function coversPlanningHorizon(snapshot: AirSnapshot, now: number): boolean {
  const first = airHourAt(snapshot, now);
  if (!first || !airHourAt(snapshot, now + PLANNING_HORIZON_MS - 1)) return false;
  const bins = new Set(snapshot.hourly.map(({ validAt }) => Date.parse(validAt)));
  for (let bin = Date.parse(first.validAt); bin < now + PLANNING_HORIZON_MS; bin += HOUR_MS) {
    if (!bins.has(bin)) return false;
  }
  return true;
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
    if (!cache.has(cityId) && cache.size >= 256) {
      const oldest = [...cache].find(([, entry]) => !entry.pending);
      if (!oldest) return unavailableAir(cityId);
      cache.delete(oldest[0]);
    }
    const entry = cache.get(cityId) ?? {};
    cache.set(cityId, entry);
    if (entry.snapshot && isFreshAir(entry.snapshot, readAt) && coversPlanningHorizon(entry.snapshot, readAt)) {
      return entry.snapshot;
    }

    if (!entry.pending && (entry.retryAt ?? -Infinity) <= readAt) {
      entry.pending = Promise.resolve()
        .then(() => loadLive(cityId))
        .catch(() => null)
        .then((result) => {
          const refreshedAt = now();
          if (result?.cityId === cityId && result.mode === "live-model" && isFreshAir(result, refreshedAt) &&
            airHourAt(result, refreshedAt) &&
            result.hourly.some(({ pm25UgM3, usAqi }) => pm25UgM3 !== null || usAqi !== null)) {
            if (coversPlanningHorizon(result, refreshedAt)) {
              entry.snapshot = result;
              entry.retryAt = undefined;
            } else {
              entry.retryAt = refreshedAt + RETRY_AFTER_FAILURE_MS;
            }
            return result;
          }
          entry.retryAt = refreshedAt + RETRY_AFTER_FAILURE_MS;
          return null;
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
