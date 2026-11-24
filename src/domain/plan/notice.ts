import type { ActionId } from "../../catalog/actions";
import { cities } from "../../catalog/cities";
import { sources } from "../../catalog/sources";
import type { AirPresentation } from "../air-presentation";
import { formatLocalTime } from "../air";
import type { PlanResult } from "./result";

const protective: Partial<Record<ActionId, string>> = {
  "move-activity-indoors": "Move the optional outdoor activity indoors if the venue is available.",
  "pause-outdoor-activity": "Pause optional outdoor exertion and follow local guidance.",
  "shift-flexible-activity": "Consider a lower-particle window for flexible activities where feasible.",
};

const travel: Partial<Record<ActionId, string>> = {
  "combine-car-trips": "Coordinate one combined supply trip where practical.",
  "replace-car-trip": "Use the feasible alternative to a separate car trip where practical.",
};

export function buildCommunityNotice(plan: PlanResult["plan"], air: AirPresentation) {
  const label = {
    demo: "Sample scenario · Saans synthetic fixture",
    "live-model": "Model estimate · Open-Meteo · CAMS Global",
    "stale-model": "Stale model estimate · Open-Meteo · CAMS Global",
    unavailable: "Live forecast unavailable",
  }[air.mode];
  const protection = plan.actions.map(({ id }) => protective[id]).find(Boolean)
    ?? "Follow the local air advisory when organizing activities.";
  const transport = plan.actions.map(({ id }) => travel[id]).find(Boolean)
    ?? "Check whether a combined supply trip is feasible.";
  return [
    `${cities[plan.cityId].name} · Community air notice`,
    label,
    air.hour ? `Data valid ${formatLocalTime(air.hour.validAt, air.timeZone)} IST` : "Forecast valid time unavailable",
    "",
    protection,
    transport,
    "",
    ...(air.mode === "live-model" || air.mode === "stale-model"
      ? [`Forecast source: ${sources["OPEN-METEO-AIR"].url}`] : []),
    `Official CPCB guidance (India AQI): ${sources["CPCB-INDIA"].url}`,
  ].join("\n");
}
