import { airSnapshotSchema, HOUR_MS } from "../domain/air";
import { cities } from "./cities";

export const DELHI_DEMO_VERSION = 1;
export const DELHI_DEMO_ANCHOR = "2026-01-15T01:30:00Z";
export const DELHI_DEMO_DISPLAY_AT = "2026-01-15T02:30:00Z";

// Local hours 07:00–18:00 IST. The index values are seeded independently.
const pm25 = [130, 120, 100, 105, 95, 85, 60, 40, 90, 95, 100, 105];
const usAqi = [230, 220, 185, 180, 170, 153, 125, 110, 160, 165, 171, 175];

export const delhiSample = airSnapshotSchema.parse({
  cityId: "delhi",
  timeZone: cities.delhi.timeZone,
  sourceId: "SAANS-DELHI-SAMPLE",
  mode: "demo",
  fetchedAt: null,
  hourly: pm25.map((pm25UgM3, index) => ({
    validAt: new Date(Date.parse(DELHI_DEMO_ANCHOR) + index * HOUR_MS).toISOString(),
    pm25UgM3,
    usAqi: usAqi[index],
  })),
});
