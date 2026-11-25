import { afterEach, describe, expect, it, vi } from "vitest";
import { AIR_FRESH_MS, AIR_STALE_MS, HOUR_MS, airHourAt } from "../../src/domain/air";
import { createOpenMeteo, normalizeOpenMeteo } from "../../src/server/air/open-meteo";
import { createAirService } from "../../src/server/air/service";
import { createAirRuntime } from "../../src/server/air/runtime";

const start = Date.parse("2026-01-15T02:00:00Z");
const city = "delhi";

function upstream(hour = start) {
  return {
    utc_offset_seconds: 0,
    hourly_units: { time: "iso8601", pm2_5: "μg/m³", us_aqi: "USAQI" },
    hourly: {
      time: Array.from({ length: 16 }, (_, offset) => new Date(hour + offset * HOUR_MS).toISOString().slice(0, 16)),
      pm2_5: Array.from<unknown>({ length: 16 }).fill(72),
      us_aqi: Array.from<unknown>({ length: 16 }).fill(150.6),
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("Open-Meteo adapter", () => {
  it("interprets explicitly UTC bins, preserves usable fields and normalizes the index once", () => {
    const payload = upstream();
    payload.hourly.pm2_5.splice(1, 4, null, -1, "45", Infinity);
    payload.hourly.us_aqi.splice(1, 4, 0, NaN, null, "151");
    const snapshot = normalizeOpenMeteo(payload, city, start + 500);
    expect(snapshot).toMatchObject({ mode: "live-model", timeZone: "Asia/Kolkata", fetchedAt: "2026-01-15T02:00:00.500Z" });
    expect(snapshot?.hourly.slice(0, 5)).toEqual([
      { validAt: "2026-01-15T02:00:00Z", pm25UgM3: 72, usAqi: 151 },
      { validAt: "2026-01-15T03:00:00Z", pm25UgM3: null, usAqi: 0 },
      { validAt: "2026-01-15T04:00:00Z", pm25UgM3: null, usAqi: null },
      { validAt: "2026-01-15T05:00:00Z", pm25UgM3: null, usAqi: null },
      { validAt: "2026-01-15T06:00:00Z", pm25UgM3: null, usAqi: null },
    ]);
    if (!snapshot) throw new Error("Expected a snapshot");
    expect(airHourAt(snapshot, start + HOUR_MS - 1)).toBe(snapshot.hourly[0]);
    expect(airHourAt(snapshot, start + HOUR_MS)).toBe(snapshot.hourly[1]);
    expect(snapshot.modelTime).toBeUndefined();
  });

  it.each([
    (payload: ReturnType<typeof upstream>) => { payload.hourly.us_aqi.pop(); },
    (payload: ReturnType<typeof upstream>) => { payload.hourly_units.pm2_5 = "mg/m³"; },
    (payload: ReturnType<typeof upstream>) => { payload.hourly_units.us_aqi = "European AQI"; },
    (payload: ReturnType<typeof upstream>) => { payload.utc_offset_seconds = 19800; },
    (payload: ReturnType<typeof upstream>) => { payload.hourly.time[1] = payload.hourly.time[0]; },
    (payload: ReturnType<typeof upstream>) => { payload.hourly.time.reverse(); },
    (payload: ReturnType<typeof upstream>) => { payload.hourly.time[0] = "2026-02-30T02:00"; },
    (payload: ReturnType<typeof upstream>) => { payload.hourly.time[0] += "+05:30"; },
  ])("rejects conflicting or malformed response metadata (%#)", (mutate) => {
    const payload = upstream();
    mutate(payload);
    expect(normalizeOpenMeteo(payload, city, start)).toBeNull();
  });

  it("targets only the allowlisted endpoint and rejects an oversized streamed response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(" ".repeat(65_537)));
    const loadLive = createOpenMeteo({ fetcher, now: () => start });
    expect(await loadLive("noida")).toBeNull();
    const [url, init] = fetcher.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://air-quality-api.open-meteo.com/v1/air-quality");
    expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
      latitude: "28.5355", longitude: "77.391", domains: "cams_global",
      timezone: "GMT", hourly: "pm2_5,us_aqi", forecast_hours: "16",
    });
    expect(init?.redirect).toBe("error");
  });

  it("aborts a hung body and returns unavailable on the deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      signal = init?.signal;
      return new Response(new ReadableStream({ pull: () => new Promise(() => {}) }));
    });
    const getAir = createAirService({ now: () => start, loadLive: createOpenMeteo({ fetcher, now: () => start, timeoutMs: 25 }) });
    const result = getAir(city, "live");
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toMatchObject({ mode: "unavailable", fetchedAt: null, hourly: [] });
    expect(signal?.aborted).toBe(true);
  });
});

describe("air cache", () => {
  it("coalesces overlapping reads per city and bypasses fetch for explicit demo mode", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockImplementation(async () => Response.json(upstream()));
    const now = () => start;
    const getAir = createAirService({ now, loadLive: createOpenMeteo({ fetcher, now }) });
    const first = getAir(city, "live");
    const second = getAir(city, "live");
    expect(await getAir(city, "demo")).toMatchObject({ mode: "demo" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const other = await getAir("noida", "live");
    expect(other.cityId).toBe("noida");
    release(Response.json(upstream()));
    expect(await first).toEqual(await second);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses a 15-minute fresh TTL, backs off failed refreshes and expires stale within two hours", async () => {
    let time = start;
    const now = () => time;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(upstream()))
      .mockImplementation(async () => new Response(null, { status: 503 }));
    const getAir = createAirService({ now, loadLive: createOpenMeteo({ fetcher, now }) });
    const fresh = await getAir(city, "live");
    expect(fresh.mode).toBe("live-model");
    time += AIR_FRESH_MS - 1;
    expect(await getAir(city, "live")).toBe(fresh);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time++;
    expect(await getAir(city, "live")).toMatchObject({ mode: "stale-model", fetchedAt: fresh.fetchedAt });
    expect((await getAir(city, "live")).mode).toBe("stale-model");
    expect(fetcher).toHaveBeenCalledTimes(2);
    time = start + AIR_STALE_MS;
    expect((await getAir(city, "live")).mode).toBe("stale-model");
    time++;
    expect((await getAir(city, "live")).mode).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("displays a partial fresh response once without caching it for planning", async () => {
    let time = start;
    const now = () => time;
    const payload = upstream();
    for (const array of Object.values(payload.hourly)) array.splice(4, 1);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload));
    const getAir = createAirService({ now, loadLive: createOpenMeteo({ fetcher, now }) });
    expect((await getAir(city, "live")).mode).toBe("live-model");
    expect((await getAir(city, "live")).mode).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    time += 30_000;
    expect((await getAir(city, "live")).mode).toBe("live-model");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("environment-configured live air", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production", APP_ORIGIN: "http://127.0.0.1:3000", AIR_LIVE_ENABLED: "1", CPCB_BULLETIN_ENABLED: "0",
  };

  it("enables real transport in the local production runtime and leaves the explicit demo offline", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(upstream()));
    const getAir = createAirRuntime(env, { now: () => start, fetcher });
    expect((await getAir(city, "demo")).mode).toBe("demo");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await getAir(city, "live")).toMatchObject({ mode: "live-model", indiaAqi: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends a paid key only to the allowlisted customer endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(upstream()));
    const opts = { now: () => start, fetcher };
    for (const endpoint of ["https://other.example/air", "https://air-quality-api.open-meteo.com/v1/air-quality"]) {
      const getAir = createAirRuntime({ ...env, OPEN_METEO_API_KEY: "synthetic-key", OPEN_METEO_AIR_URL: endpoint }, opts);
      expect((await getAir(city, "live")).mode).toBe("unavailable");
    }
    expect(fetcher).not.toHaveBeenCalled();
    const getAir = createAirRuntime({ ...env, OPEN_METEO_API_KEY: "synthetic-key" }, opts);
    expect((await getAir(city, "live")).mode).toBe("live-model");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.hostname).toBe("customer-air-quality-api.open-meteo.com");
    expect(url.searchParams.get("apikey")).toBe("synthetic-key");
  });

  it("requires and checks the shared upstream budget before any hosted forecast", async () => {
    const hosted = { ...env, APP_ORIGIN: "https://saans.example" };
    const fetcher = vi.fn<typeof fetch>();
    const opts = { now: () => start, fetcher };
    expect((await createAirRuntime(hosted, opts)(city, "live")).mode).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
    const config = { ...hosted, AIR_UPSTREAM_PER_MINUTE: "5", AIR_UPSTREAM_PER_DAY: "50",
      AIR_BUDGET_NAMESPACE: "air", UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "synthetic" };
    fetcher.mockImplementationOnce(async () => Response.json({ result: 0 }));
    expect((await createAirRuntime(config, opts)(city, "live")).mode).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementationOnce(async () => Response.json({ result: 1 }))
      .mockImplementationOnce(async () => Response.json(upstream()));
    expect((await createAirRuntime(config, opts)(city, "live")).mode).toBe("live-model");
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      "example.upstash.io", "example.upstash.io", "air-quality-api.open-meteo.com",
    ]);
  });
});
