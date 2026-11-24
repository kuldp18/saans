import { z } from "zod";
import { cities, cityIdSchema } from "../catalog/cities";

export const HOUR_MS = 3_600_000;
export const AIR_FRESH_MS = 15 * 60_000;
export const AIR_STALE_MS = 2 * HOUR_MS;
export const PLANNING_HORIZON_MS = 12 * HOUR_MS;
const utc = z.iso.datetime();
const hourlySchema = z.strictObject({
  validAt: utc,
  pm25UgM3: z.number().nonnegative().nullable(),
  usAqi: z.int().nonnegative().nullable(),
});

export const airSnapshotSchema = z.strictObject({
  cityId: cityIdSchema,
  timeZone: z.literal("Asia/Kolkata"),
  sourceId: z.enum(["OPEN-METEO-AIR", "SAANS-DELHI-SAMPLE"]),
  mode: z.enum(["live-model", "stale-model", "demo", "unavailable"]),
  fetchedAt: utc.nullable(),
  modelTime: utc.optional(),
  hourly: z.array(hourlySchema).max(48),
}).superRefine((snapshot, ctx) => {
  const { mode, fetchedAt, hourly, sourceId } = snapshot;
  const model = mode === "live-model" || mode === "stale-model";
  const validMode = model
    ? sourceId === "OPEN-METEO-AIR" && fetchedAt !== null && hourly.length > 0
    : fetchedAt === null && snapshot.modelTime === undefined && (
      mode === "demo"
        ? sourceId === "SAANS-DELHI-SAMPLE" && snapshot.cityId === "delhi" && hourly.length > 0
        : sourceId === "OPEN-METEO-AIR" && hourly.length === 0
    );
  if (!validMode) ctx.addIssue({ code: "custom", path: ["mode"], message: "Inconsistent snapshot mode" });

  let previous: number | undefined;
  for (const [index, bin] of hourly.entries()) {
    const time = Date.parse(bin.validAt);
    const phase = mode === "demo" ? 30 * 60_000 : 0;
    if (time % HOUR_MS !== phase || (previous !== undefined && time <= previous)) {
      ctx.addIssue({ code: "custom", path: ["hourly", index, "validAt"], message: "Expected unique ascending hourly UTC timestamps" });
    }
    previous = time;
  }
});

export type AirSnapshot = z.infer<typeof airSnapshotSchema>;
export type AirHour = z.infer<typeof hourlySchema>;
export type RequestedAirMode = "live" | "demo";

export function unavailableAir(cityId: AirSnapshot["cityId"]): AirSnapshot {
  return { cityId, timeZone: cities[cityId].timeZone, sourceId: "OPEN-METEO-AIR", mode: "unavailable", fetchedAt: null, hourly: [] };
}

export function airHourAt(snapshot: AirSnapshot, instant: number): AirHour | undefined {
  return snapshot.hourly.find(({ validAt }) => {
    const start = Date.parse(validAt);
    return instant >= start && instant < start + HOUR_MS;
  });
}

export function isFreshAir(snapshot: AirSnapshot, instant: number): boolean {
  if (snapshot.mode === "demo") return true;
  if (snapshot.mode !== "live-model" || snapshot.fetchedAt === null) return false;
  const age = instant - Date.parse(snapshot.fetchedAt);
  return age >= 0 && age < AIR_FRESH_MS;
}

export function usAqiBand(value: number | null): string | null {
  if (value === null || !Number.isInteger(value) || value < 0) return null;
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for sensitive groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very unhealthy";
  return "Hazardous";
}

export function formatLocalTime(validAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(validAt));
}
