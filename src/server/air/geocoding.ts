import "server-only";
import { z } from "zod";
import { placeSchema, type ForecastPlace, type LocationId } from "../../catalog/cities";
import { readBoundedJson, withDeadline } from "../http/bounded-json";

const publicBase = "https://geocoding-api.open-meteo.com/v1";
const customerBase = "https://customer-geocoding-api.open-meteo.com/v1";
const byteLimit = 32 * 1024;
const maxConcurrentLookups = 32;
const maxSearchResults = 12;
const rowSchema = z.object({
  id: z.number().int().positive().max(999_999_999_999),
  name: z.string(), country_code: z.string(), admin1: z.string().optional(),
  timezone: z.string(), feature_code: z.string().startsWith("P"),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});
const searchSchema = z.object({ results: z.array(z.unknown()).max(maxSearchResults).optional() });

function normalize(value: unknown): ForecastPlace | undefined {
  const row = rowSchema.safeParse(value);
  if (!row.success) return;
  const { id, name, country_code, admin1, timezone, latitude, longitude } = row.data;
  const place = placeSchema.safeParse({ id: `geo-${id}`, name, countryCode: country_code, region: admin1, timeZone: timezone });
  return place.success ? { ...place.data, latitude, longitude } : undefined;
}

function createLookupCache<Key, Value>(capacity: number, ttl: number, now: () => number) {
  const cache = new Map<Key, { value: Value; expires: number }>();
  const pending = new Map<Key, Promise<Value | undefined>>();

  function remember(key: Key, value: Value) {
    // Moving a refreshed entry to the end keeps eviction ordered by update time.
    cache.delete(key);
    if (cache.size >= capacity) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { value, expires: now() + ttl });
  }

  async function lookup(key: Key, load: () => Promise<Value | undefined>) {
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    const active = pending.get(key);
    if (active) return active;
    if (pending.size >= maxConcurrentLookups) return undefined;

    const job = load().then((value) => {
      if (value !== undefined) remember(key, value);
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }

  return { remember, lookup };
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
  const places = createLookupCache<LocationId, ForecastPlace>(256, 60 * 60_000, now);
  const searches = createLookupCache<string, ForecastPlace[]>(128, 5 * 60_000, now);

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

  return {
    async search(name: string) {
      const results = await searches.lookup(name.toLowerCase(), async () => {
        const query = new URLSearchParams({ name, count: String(maxSearchResults), language: "en" });
        const result = searchSchema.safeParse(await request("search", query));
        if (!result.success) return;
        const placesFound = (result.data.results ?? []).map(normalize).filter((place) => place !== undefined);
        for (const place of placesFound) places.remember(place.id, place);
        return placesFound;
      });
      return results ?? null;
    },
    async resolve(id: LocationId) {
      if (!id.startsWith("geo-")) return;
      return places.lookup(id, async () => {
        const place = normalize(await request("get", new URLSearchParams({ id: id.slice(4) })));
        return place?.id === id ? place : undefined;
      });
    },
  };
}
