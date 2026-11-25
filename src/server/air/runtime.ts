import "server-only";
import { builtInPlace, publicPlace, type LocationId } from "../../catalog/cities";
import { unavailableAir, type RequestedAirMode } from "../../domain/air";
import { createHash } from "node:crypto";
import { configuredOrigin } from "../ai/access";
import { createLocalBudget, createSharedBudget, parseBudgetCaps } from "../ai/budget";
import { createOpenMeteo, openMeteoEndpoint } from "./open-meteo";
import { createAirService } from "./service";
import { createCpcbProvider } from "./cpcb";
import { createGeocoder } from "./geocoding";

export const airClock = Date.now;
const airBucket = createHash("sha256").update("saans-open-meteo").digest("hex");

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function liveSources(env: NodeJS.ProcessEnv, fetcher: typeof fetch, now: () => number) {
  if (env.AIR_LIVE_ENABLED !== "1") return {};
  const origin = configuredOrigin(env.APP_ORIGIN);
  const loopback = origin?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  const local = loopback || (env.NODE_ENV === "development" && !env.APP_ORIGIN);
  if (!local && origin?.protocol !== "https:") return {};

  const apiKey = env.OPEN_METEO_API_KEY?.trim() || undefined;
  const endpoint = openMeteoEndpoint(env.OPEN_METEO_AIR_URL, apiKey);
  const forecastHours = integer(env.AIR_FORECAST_HOURS, 16, 13, 48);
  const timeoutMs = integer(env.AIR_TIMEOUT_MS, 2_500, 500, 5_000);
  const cpcbTimeoutMs = integer(env.CPCB_BULLETIN_TIMEOUT_MS, 4_500, 500, 5_500);
  const maxAgeHours = integer(env.CPCB_BULLETIN_MAX_AGE_HOURS, 48, 24, 72);
  const minute = env.AIR_UPSTREAM_PER_MINUTE || (local ? "12" : undefined);
  const day = env.AIR_UPSTREAM_PER_DAY || (local ? "500" : undefined);
  const caps = parseBudgetCaps(minute, day, minute);
  if (!caps) return {};

  const budget = local ? createLocalBudget(caps, now) : createSharedBudget({
    url: env.UPSTASH_REDIS_REST_URL ?? "",
    token: env.UPSTASH_REDIS_REST_TOKEN ?? "",
    namespace: env.AIR_BUDGET_NAMESPACE ?? "",
    caps, fetcher,
  });
  if (!budget) return {};

  const reserve = (signal: AbortSignal) => budget(airBucket, signal);
  const geocoder = timeoutMs ? createGeocoder({
    fetcher, now, reserve, timeoutMs, apiKey, endpoint: env.OPEN_METEO_GEOCODING_URL?.trim(),
  }) : undefined;
  const loadForecast = endpoint && forecastHours && timeoutMs
    ? createOpenMeteo({ fetcher, now, endpoint, apiKey, forecastHours, timeoutMs, reserve, resolvePlace: geocoder?.resolve })
    : undefined;
  const loadIndia = env.CPCB_BULLETIN_ENABLED !== "0" && cpcbTimeoutMs && maxAgeHours
    ? createCpcbProvider({
      fetcher, now, reserve, archiveUrl: env.CPCB_BULLETIN_ARCHIVE_URL?.trim() || undefined,
      timeoutMs: cpcbTimeoutMs, maxAgeHours,
    })
    : undefined;
  return { loadForecast, loadIndia, geocoder };
}

export function createAirRuntime(env: NodeJS.ProcessEnv, { fetcher = fetch, now = airClock } = {}) {
  const { loadForecast, loadIndia, geocoder } = liveSources(env, fetcher, now);
  const getForecast = createAirService({ now, loadLive: loadForecast });
  const getAir = async (city: LocationId, mode: RequestedAirMode) => {
    if (mode === "demo") return getForecast(city, mode);
    const builtIn = builtInPlace(city);
    const place = builtIn ?? await geocoder?.resolve(city);
    if (!place) return unavailableAir(city);
    const [forecast, indiaAqi] = await Promise.all([
      getForecast(city, mode), place.countryCode === "IN" ? loadIndia?.(place.name) : undefined,
    ]);
    const snapshot = !builtIn && !forecast.location ? unavailableAir(city, publicPlace(place)) : forecast;
    return { ...snapshot, indiaAqi: indiaAqi ?? null };
  };
  return Object.assign(getAir, { search: geocoder?.search });
}

export const getAir = createAirRuntime(process.env);

export async function searchLocations(query: string) {
  const results = await getAir.search?.(query);
  return results?.map(publicPlace) ?? null;
}
