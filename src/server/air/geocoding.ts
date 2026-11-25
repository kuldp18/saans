import "server-only";
import { z } from "zod";
import { placeSchema, type ForecastPlace, type LocationId } from "../../catalog/cities";
import { readBoundedJson, withDeadline } from "../http/bounded-json";

const publicBase = "https://geocoding-api.open-meteo.com/v1";
const customerBase = "https://customer-geocoding-api.open-meteo.com/v1";
const byteLimit = 32 * 1024;
const rowSchema = z.object({
  id: z.number().int().positive().max(999_999_999_999),
  name: z.string(), country_code: z.string(), admin1: z.string().optional(),
  timezone: z.string(), feature_code: z.string().startsWith("P"),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});
const searchSchema = z.object({ results: z.array(z.unknown()).max(12).optional() });

function normalize(value: unknown): ForecastPlace | undefined {
  const row = rowSchema.safeParse(value);
  if (!row.success) return;
  const { id, name, country_code, admin1, timezone, latitude, longitude } = row.data;
  const place = placeSchema.safeParse({ id: `geo-${id}`, name, countryCode: country_code, region: admin1, timeZone: timezone });
  return place.success ? { ...place.data, latitude, longitude } : undefined;
}

export function createGeocoder({ fetcher, now, reserve, timeoutMs, endpoint, apiKey }: {
  fetcher: typeof fetch;
  now: () => number;
  reserve: (signal: AbortSignal) => Promise<boolean>;
  timeoutMs: number;
  endpoint?: string;
  apiKey?: string;
}) {
  const allowedBase = apiKey ? customerBase : publicBase;
  if (endpoint && endpoint !== allowedBase) return;
  const places = new Map<LocationId, { place: ForecastPlace; expires: number }>();
  const searches = new Map<string, { results: ForecastPlace[]; expires: number }>();

  async function request(path: "get" | "search", query: URLSearchParams): Promise<unknown> {
    if (apiKey) query.set("apikey", apiKey);
    try {
      return await withDeadline(timeoutMs, async (signal) => {
        if (!(await reserve(signal))) return null;
        signal.throwIfAborted();
        const response = await fetcher(`${allowedBase}/${path}?${query}`, {
          signal, redirect: "error", cache: "no-store", headers: { accept: "application/json" },
        });
        if (!response.ok || Number(response.headers.get("content-length")) > byteLimit) {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        return readBoundedJson(response.body, byteLimit, signal);
      });
    } catch {
      return null;
    }
  }

  function remember(place: ForecastPlace) {
    if (!places.has(place.id) && places.size >= 256) places.delete(places.keys().next().value!);
    places.set(place.id, { place, expires: now() + 60 * 60_000 });
    return place;
  }

  const pending = new Map<LocationId, Promise<ForecastPlace | undefined>>();
  return {
    async search(name: string) {
      const key = name.toLowerCase();
      const cached = searches.get(key);
      if (cached && cached.expires > now()) return cached.results;
      const result = searchSchema.safeParse(await request("search", new URLSearchParams({ name, count: "12", language: "en" })));
      if (!result.success) return null;
      const results = (result.data.results ?? []).map(normalize).filter((place) => place !== undefined).map(remember);
      if (!searches.has(key) && searches.size >= 128) searches.delete(searches.keys().next().value!);
      searches.set(key, { results, expires: now() + 5 * 60_000 });
      return results;
    },
    async resolve(id: LocationId) {
      const cached = places.get(id);
      if (cached && cached.expires > now()) return cached.place;
      if (!id.startsWith("geo-")) return;
      const existing = pending.get(id);
      if (existing) return existing;
      if (pending.size >= 32) return;
      const job = request("get", new URLSearchParams({ id: id.slice(4) })).then((value) => {
        const place = normalize(value);
        return place?.id === id ? remember(place) : undefined;
      }).finally(() => pending.delete(id));
      pending.set(id, job);
      return job;
    },
  };
}
