import { DELHI_DEMO_DISPLAY_AT } from "../catalog/delhi-demo";
import { builtInPlace } from "../catalog/cities";
import { airHourAt, type AirSnapshot } from "./air";

export function presentAir(snapshot: AirSnapshot, now: number) {
  const displayAt = snapshot.mode === "demo" ? Date.parse(DELHI_DEMO_DISPLAY_AT) : now;
  const builtIn = builtInPlace(snapshot.cityId);
  return {
    mode: snapshot.mode,
    sourceId: snapshot.sourceId,
    timeZone: snapshot.timeZone,
    hour: airHourAt(snapshot, displayAt) ?? null,
    indiaAqi: snapshot.mode === "demo" ? null : snapshot.indiaAqi ?? null,
    cityName: snapshot.location?.name ?? builtIn?.name ?? "Selected location",
    countryCode: snapshot.location?.countryCode ?? builtIn?.countryCode ?? null,
  };
}

export type AirPresentation = ReturnType<typeof presentAir>;
