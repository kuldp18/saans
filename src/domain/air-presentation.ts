import { DELHI_DEMO_DISPLAY_AT } from "../catalog/delhi-demo";
import { airHourAt, type AirSnapshot } from "./air";

export function presentAir(snapshot: AirSnapshot, now: number) {
  const displayAt = snapshot.mode === "demo" ? Date.parse(DELHI_DEMO_DISPLAY_AT) : now;
  return {
    mode: snapshot.mode,
    sourceId: snapshot.sourceId,
    timeZone: snapshot.timeZone,
    hour: airHourAt(snapshot, displayAt) ?? null,
  };
}

export type AirPresentation = ReturnType<typeof presentAir>;
