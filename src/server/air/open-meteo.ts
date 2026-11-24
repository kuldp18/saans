import { z } from "zod";
import { cities, type CityId } from "../../catalog/cities";
import { airSnapshotSchema, type AirSnapshot } from "../../domain/air";

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
const FORECAST_HOURS = 16;
const MAX_RESPONSE_BYTES = 64 * 1024;
const utcHour = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;

const responseSchema = z.object({
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal("iso8601"),
    pm2_5: z.enum(["μg/m³", "µg/m³"]),
    us_aqi: z.literal("U.S. AQI"),
  }),
  hourly: z.object({
    time: z.array(z.string().regex(utcHour)).min(1).max(FORECAST_HOURS),
    pm2_5: z.array(z.unknown()).max(FORECAST_HOURS),
    us_aqi: z.array(z.unknown()).max(FORECAST_HOURS),
  }),
});

function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeOpenMeteo(payload: unknown, cityId: CityId, fetchedAtMs: number): AirSnapshot | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
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
    timeZone: cities[cityId].timeZone,
    sourceId: "OPEN-METEO-AIR",
    mode: "live-model",
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    hourly,
  });
  return snapshot.success ? snapshot.data : null;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    throw new Error("Unavailable air response");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Air response exceeds size limit");
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function createOpenMeteo({ fetcher, now, timeoutMs = 2_500 }: {
  fetcher: typeof fetch;
  now: () => number;
  timeoutMs?: number;
}) {
  return async (cityId: CityId): Promise<AirSnapshot | null> => {
    const { latitude, longitude } = cities[cityId];
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      domains: "cams_global",
      hourly: "pm2_5,us_aqi",
      timezone: "GMT",
      timeformat: "iso8601",
      forecast_hours: String(FORECAST_HOURS),
    }).toString();

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Air provider deadline exceeded"));
        }, timeoutMs);
      });
      const response = fetcher(url, {
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
        headers: { accept: "application/json" },
      }).then(readJson);
      const payload = await Promise.race([response, deadline]);
      return normalizeOpenMeteo(payload, cityId, now());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
