import { z } from "zod";

export const cityIdSchema = z.enum([
  "delhi", "noida", "gurugram", "lucknow", "ahmedabad", "kolkata",
]);
export type CityId = z.infer<typeof cityIdSchema>;
const geocoderId = z.templateLiteral(["geo-", z.string()]).refine((id) => /^geo-[1-9]\d{0,11}$/.test(id));
export const locationQuerySchema = z.string().trim().min(2).max(80).regex(/^[^\r\n\x00-\x1f]+$/);
export const locationIdSchema = z.union([cityIdSchema, geocoderId]);
export type LocationId = z.infer<typeof locationIdSchema>;

export const timeZoneSchema = z.string().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Invalid time zone");
export const placeSchema = z.strictObject({
  id: locationIdSchema,
  name: z.string().trim().min(1).max(100).regex(/^[^\r\n\x00-\x1f]+$/),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().trim().min(1).max(100).regex(/^[^\r\n\x00-\x1f]+$/).optional(),
  timeZone: timeZoneSchema,
});
export type Place = z.infer<typeof placeSchema>;
export type ForecastPlace = Place & { latitude: number; longitude: number };

export function publicPlace({ id, name, countryCode, region, timeZone }: ForecastPlace): Place {
  return { id, name, countryCode, region, timeZone };
}

const indiaTimeZone = "Asia/Kolkata";

export const cities = {
  delhi: { name: "Delhi", latitude: 28.6139, longitude: 77.209, timeZone: indiaTimeZone },
  noida: { name: "Noida", latitude: 28.5355, longitude: 77.391, timeZone: indiaTimeZone },
  gurugram: { name: "Gurugram", latitude: 28.4595, longitude: 77.0266, timeZone: indiaTimeZone },
  lucknow: { name: "Lucknow", latitude: 26.8467, longitude: 80.9462, timeZone: indiaTimeZone },
  ahmedabad: { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714, timeZone: indiaTimeZone },
  kolkata: { name: "Kolkata", latitude: 22.5726, longitude: 88.3639, timeZone: indiaTimeZone },
} as const satisfies Record<CityId, { name: string; latitude: number; longitude: number; timeZone: string }>;

export function builtInPlace(id: LocationId): ForecastPlace | undefined {
  if (!Object.hasOwn(cities, id)) return undefined;
  return { id, ...cities[id as CityId], countryCode: "IN" };
}

export function displayPlace(place: Place): string {
  return [place.name, place.region === place.name ? undefined : place.region, place.countryCode].filter(Boolean).join(", ");
}
