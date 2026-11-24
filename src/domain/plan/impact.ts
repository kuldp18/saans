import { HOUR_MS, type AirSnapshot } from "../air";
import type { Travel } from "./input";

export type Window = { start: number; end: number };
export type WindowStats = { pm25UgM3: number | null; maxUsAqi: number | null; aqiComplete: boolean };

export function createWindowReader(snapshot: AirSnapshot) {
  const bins = new Map(snapshot.hourly.map((hour) => [Date.parse(hour.validAt), hour]));
  const phase = snapshot.hourly.length ? Date.parse(snapshot.hourly[0].validAt) % HOUR_MS : 0;
  return ({ start, end }: Window): WindowStats | null => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 2 * HOUR_MS) return null;
    let pm25UgM3: number | null = 0;
    let maxUsAqi: number | null = null;
    let aqiComplete = true;
    const first = Math.floor((start - phase) / HOUR_MS) * HOUR_MS + phase;
    for (let bin = first; bin < end; bin += HOUR_MS) {
      const overlap = Math.min(end, bin + HOUR_MS) - Math.max(start, bin);
      const hour = bins.get(bin);
      pm25UgM3 = hour?.pm25UgM3 == null || pm25UgM3 === null
        ? null
        : pm25UgM3 + hour.pm25UgM3 * (overlap / (end - start));
      if (hour?.usAqi == null) aqiComplete = false;
      else maxUsAqi = Math.max(maxUsAqi ?? 0, hour.usAqi);
    }
    return { pm25UgM3, maxUsAqi, aqiComplete };
  };
}

export function compareOutdoorPm25(baseline: number, proposed: number) {
  const delta = baseline - proposed;
  if (delta <= 0) return null;
  return {
    kind: "outdoor-pm25",
    unit: "µg/m³",
    baseline,
    proposed,
    delta,
    percent: (delta / baseline) * 100,
  } as const;
}

function vehicleKm(journeys: Travel["baseline"]): number | null {
  const vehicles = new Map<string, number>();
  for (const { vehicleId, km } of journeys) {
    const previous = vehicles.get(vehicleId);
    if (previous !== undefined && previous !== km) return null;
    vehicles.set(vehicleId, km);
  }
  return [...vehicles.values()].reduce((sum, km) => sum + km, 0);
}

export function comparePrivateCarKm(travel: Travel) {
  if (!travel.feasible || (travel.kind === "consolidate" && travel.proposed.length === 0)) return null;
  const baseline = vehicleKm(travel.baseline);
  const proposed = vehicleKm(travel.proposed);
  if (baseline === null || proposed === null || baseline <= proposed) return null;
  return { kind: "private-car-distance", unit: "vehicle-km", baseline, proposed, delta: baseline - proposed } as const;
}
