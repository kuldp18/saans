import { expect, it, vi } from "vitest";
import { publicPlace } from "../../src/catalog/cities";
import { createAirRuntime } from "../../src/server/air/runtime";

const paris = {
  id: 2988507, name: "Paris", country_code: "FR", admin1: "Île-de-France",
  latitude: 48.85341, longitude: 2.3488, timezone: "Europe/Paris", feature_code: "PPLC",
};

it("resolves worldwide metadata, avoids CPCB abroad, and reuses matched provider coordinates", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/search") {
      expect(url.searchParams.get("name")).toBe("Paris");
      return Response.json({ results: [paris, { ...paris, id: 2, feature_code: "ADM1" }, { ...paris, id: 3, timezone: "Bogus" }] });
    }
    expect(url.hostname).toBe("air-quality-api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe(String(paris.latitude));
    return Response.json({
      utc_offset_seconds: 0, hourly_units: { time: "iso8601", pm2_5: "μg/m³", us_aqi: "USAQI" },
      hourly: { time: ["2026-01-15T12:00"], pm2_5: [7], us_aqi: [32] },
    });
  });
  const getAir = createAirRuntime({ NODE_ENV: "test", AIR_LIVE_ENABLED: "1", APP_ORIGIN: "http://localhost:3000" }, {
    fetcher, now: () => Date.parse("2026-01-15T12:30:00Z"),
  });
  expect((await getAir.search?.("Paris"))?.map(publicPlace)).toEqual([
    { id: "geo-2988507", name: "Paris", countryCode: "FR", region: "Île-de-France", timeZone: "Europe/Paris" },
  ]);
  await getAir.search?.("Paris");
  expect(await getAir("geo-2988507", "live")).toMatchObject({
    mode: "live-model", timeZone: "Europe/Paris", location: { name: "Paris" }, indiaAqi: null,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("shares direct ID lookups and excludes mismatched and unconfigured locations", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(paris));
  const getAir = createAirRuntime({ NODE_ENV: "test", AIR_LIVE_ENABLED: "1", APP_ORIGIN: "http://localhost:3000" }, { fetcher });
  const reads = await Promise.all([getAir("geo-42", "live"), getAir("geo-42", "live")]);
  expect(reads.every((air) => air.mode === "unavailable" && !air.location)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toBe("https://geocoding-api.open-meteo.com/v1/get?id=42");
  const blocked = createAirRuntime({ NODE_ENV: "test", AIR_LIVE_ENABLED: "1", APP_ORIGIN: "https://example.com" }, { fetcher });
  expect(blocked.search).toBeUndefined();
});
