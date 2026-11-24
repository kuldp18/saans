import { createOpenMeteo } from "./open-meteo";
import { createAirService } from "./service";

export const airClock = Date.now;
const operatorLiveEnabled = process.env.NODE_ENV === "development" && process.env.AIR_LIVE_ENABLED === "1";

export const getAir = createAirService({
  now: airClock,
  loadLive: operatorLiveEnabled ? createOpenMeteo({ now: airClock, fetcher: fetch }) : undefined,
});
