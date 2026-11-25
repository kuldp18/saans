import { z } from "zod";
import { builtInPlace, type ForecastPlace, type LocationId, type Place } from "../../catalog/cities";
import { airSnapshotSchema, type AirSnapshot } from "../../domain/air";
import { readBoundedJson, withDeadline } from "../http/bounded-json";

const PUBLIC_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
const CUSTOMER_ENDPOINT = "https://customer-air-quality-api.open-meteo.com/v1/air-quality";
const MAX_FORECAST_HOURS = 48;
const MAX_RESPONSE_BYTES = 64 * 1024;
const utcHour = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;

const responseSchema = z.object({
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal("iso8601"),
    pm2_5: z.enum(["μg/m³", "µg/m³"]),
    us_aqi: z.literal("USAQI"),
  }),
  hourly: z.object({
    time: z.array(z.string().regex(utcHour)).min(1).max(MAX_FORECAST_HOURS),
    pm2_5: z.array(z.unknown()).max(MAX_FORECAST_HOURS),
    us_aqi: z.array(z.unknown()).max(MAX_FORECAST_HOURS),
  }),
});

function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeOpenMeteo(payload: unknown, cityId: LocationId, fetchedAtMs: number, location?: Place): AirSnapshot | null {
  const parsed = responseSchema.safeParse(payload);
  const timeZone = location?.timeZone ?? builtInPlace(cityId)?.timeZone;
  if (!parsed.success || !timeZone) return null;
  const { time, pm2_5: pm25, us_aqi: aqi } = parsed.data.hourly;
  if (time.length !== pm25.length || time.length !== aqi.length) return null;

  const hourly = time.map((validAt, index) => {
    const usAqi = nonnegative(aqi[index]);
    const rounded = usAqi === null ? null : Math.round(usAqi);
    return {
      validAt: `${validAt}:00Z`,
      pm25UgM3: nonnegative(pm25[index]),
      // Normalize the provider's US index once before classification.
      usAqi: rounded !== null && Number.isSafeInteger(rounded) ? rounded : null,
    };
  });

  const snapshot = airSnapshotSchema.safeParse({
    cityId,
    timeZone,
    ...(location ? { location } : {}),
    sourceId: "OPEN-METEO-AIR",
    mode: "live-model",
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    hourly,
  });
  return snapshot.success ? snapshot.data : null;
}

export function openMeteoEndpoint(configured: string | undefined, key: string | undefined) {
  const endpoint = configured?.trim() || (key ? CUSTOMER_ENDPOINT : PUBLIC_ENDPOINT);
  if (endpoint === PUBLIC_ENDPOINT && !key) return endpoint;
  if (endpoint === CUSTOMER_ENDPOINT && key) return endpoint;
  return null;
}

export function createOpenMeteo({
  fetcher, now, timeoutMs = 2_500, forecastHours = 16, endpoint = PUBLIC_ENDPOINT, apiKey, reserve, resolvePlace,
}: {
  fetcher: typeof fetch;
  now: () => number;
  timeoutMs?: number;
  forecastHours?: number;
  endpoint?: string;
  apiKey?: string;
  reserve?: (signal: AbortSignal) => Promise<boolean>;
  resolvePlace?: (id: LocationId) => Promise<ForecastPlace | undefined>;
}) {
  return async (cityId: LocationId): Promise<AirSnapshot | null> => {
    const builtIn = builtInPlace(cityId);
    const place = builtIn ?? await resolvePlace?.(cityId);
    if (!place) return null;
    const { latitude, longitude, ...location } = place;
    const allowedEndpoint = openMeteoEndpoint(endpoint, apiKey);
    if (!allowedEndpoint) return null;
    const url = new URL(allowedEndpoint);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      domains: "cams_global",
      hourly: "pm2_5,us_aqi",
      timezone: "GMT",
      timeformat: "iso8601",
      forecast_hours: String(forecastHours),
    }).toString();
    if (apiKey) url.searchParams.set("apikey", apiKey);

    try {
      return await withDeadline(timeoutMs, async (signal) => {
        if (reserve && !(await reserve(signal))) return null;
        signal.throwIfAborted();
        const response = await fetcher(url, {
          signal, redirect: "error", cache: "no-store", headers: { accept: "application/json" },
        });
        if (!response.ok || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        const payload = await readBoundedJson(response.body, MAX_RESPONSE_BYTES, signal);
        return normalizeOpenMeteo(payload, cityId, now(), builtIn ? undefined : location);
      });
    } catch {
      return null;
    }
  };
}
