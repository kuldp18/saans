import { actions, type ActionId } from "../../catalog/actions";
import { DELHI_DEMO_ANCHOR } from "../../catalog/delhi-demo";
import type { SourceId } from "../../catalog/sources";
import { airHourAt, isFreshAir, PLANNING_HORIZON_MS, type AirSnapshot } from "../air";
import { compareOutdoorPm25, comparePrivateCarKm, createWindowReader, type WindowStats } from "./impact";
import type { Activity, PlanInput } from "./input";

const HALF_HOUR_MS = 30 * 60_000;
const SEVERE_AQI = 201;
type ActivityId = Activity["activityId"];
type WindowReader = ReturnType<typeof createWindowReader>;
type Impact = NonNullable<ReturnType<typeof compareOutdoorPm25> | ReturnType<typeof comparePrivateCarKm>>;
type FallbackReason = "fixed" | "outdoor-policy" | "air-unavailable" | "incomplete-baseline" | "no-cleaner-window";
export type PlanAction = {
  id: ActionId;
  sourceId: SourceId;
  activityId?: ActivityId;
  adjustment?: { start: string; end: string; originalStart: string; originalEnd: string };
  impact?: Impact;
  reason?: FallbackReason;
  approvedReason?: "alternate";
};

function outdoorAllowed(stats: WindowStats | null, cautious: boolean): boolean {
  return stats?.aqiComplete === true && stats.maxUsAqi !== null && stats.maxUsAqi < (cautious ? 101 : 151);
}

function routineDecision({
  activity, input, read, anchor, fresh, severeNow,
}: {
  activity: Activity;
  input: PlanInput;
  read: WindowReader;
  anchor: number;
  fresh: boolean;
  severeNow: boolean;
}) {
  const start = Date.parse(activity.start);
  const end = Date.parse(activity.end);
  const limit = anchor + PLANNING_HORIZON_MS;
  const optionalOutdoor = activity.activityId === "outdoor-group-activity";
  const baseline = fresh && start >= anchor && end <= limit ? read({ start, end }) : null;
  const severeDuringActivity = (baseline?.maxUsAqi ?? 0) >= SEVERE_AQI;
  const outdoorBlocked = optionalOutdoor && (severeNow || !outdoorAllowed(baseline, input.cautious));
  const canGoIndoors = optionalOutdoor && input.indoorVenueAvailable && outdoorBlocked;
  let proposal: Pick<PlanAction, "adjustment" | "impact"> | undefined;

  if (activity.flexibility === "flexible" && baseline?.pm25UgM3 != null && !canGoIndoors &&
    !(optionalOutdoor && severeNow)) {
    const duration = end - start;
    const phase = ((start % HALF_HOUR_MS) + HALF_HOUR_MS) % HALF_HOUR_MS;
    const first = Math.ceil((Math.max(anchor, Date.parse(activity.earliestStart)) - phase) / HALF_HOUR_MS) * HALF_HOUR_MS + phase;
    const last = Math.min(limit, Date.parse(activity.latestEnd)) - duration;
    let bestStart = start;
    let bestPm25 = baseline.pm25UgM3;
    for (let candidate = first; candidate <= last; candidate += HALF_HOUR_MS) {
      const stats = read({ start: candidate, end: candidate + duration });
      if (stats?.pm25UgM3 == null || stats.pm25UgM3 >= bestPm25) continue;
      if (optionalOutdoor && !outdoorAllowed(stats, input.cautious)) continue;
      bestStart = candidate;
      bestPm25 = stats.pm25UgM3;
    }
    const impact = compareOutdoorPm25(baseline.pm25UgM3, bestPm25);
    if (impact) {
      proposal = {
        impact,
        adjustment: {
          start: new Date(bestStart).toISOString(),
          end: new Date(bestStart + duration).toISOString(),
          originalStart: activity.start,
          originalEnd: activity.end,
        },
      };
    }
  }

  const reason = outdoorBlocked ? "outdoor-policy"
    : activity.flexibility === "fixed" ? "fixed"
      : !fresh ? "air-unavailable"
        : baseline?.pm25UgM3 == null ? "incomplete-baseline" : "no-cleaner-window";
  return {
    activityId: activity.activityId,
    severeDuringActivity,
    canMove: !!proposal,
    canGoIndoors,
    pause: outdoorBlocked && !canGoIndoors && !proposal,
    proposal,
    reason,
  } as const;
}

const routineOrder = [
  "move-activity-indoors", "shift-flexible-activity", "pause-outdoor-activity", "keep-commitment",
] as const;
const otherActions = [
  "skip-incense-and-candles", "use-particle-filter", "consider-particle-filter", "combine-car-trips", "replace-car-trip",
] as const;

export function buildRulesPlan(input: PlanInput, snapshot: AirSnapshot, now: number) {
  const anchor = snapshot.mode === "demo" ? Date.parse(DELHI_DEMO_ANCHOR) : now;
  const fresh = isFreshAir(snapshot, anchor);
  const severeNow = fresh && (airHourAt(snapshot, anchor)?.usAqi ?? 0) >= SEVERE_AQI;
  const read = createWindowReader(snapshot);
  const decisions = input.activities.map((activity) => routineDecision({ activity, input, read, anchor, fresh, severeNow }));
  const advisory = severeNow || decisions.some(({ severeDuringActivity }) => severeDuringActivity);
  const travel = input.travel && comparePrivateCarKm(input.travel);
  const context = { input, advisory, canMove: false, canGoIndoors: false, pause: false, hasTravelSavings: !!travel };
  const cards: PlanAction[] = [];

  const append = (id: ActionId, fields: Omit<PlanAction, "id" | "sourceId"> = {}) => {
    const catalogSource = actions[id].sourceId;
    const sourceId = id === "shift-flexible-activity" ? snapshot.sourceId
      : catalogSource === "CPCB-INDIA" && (snapshot.location?.countryCode ?? "IN") !== "IN" ? "OPEN-METEO-AIR" : catalogSource;
    cards.push({ id, sourceId, ...fields });
  };
  if (actions["check-local-advisory"].eligible(context)) append("check-local-advisory");
  for (const decision of decisions) {
    const id = routineOrder.find((candidate) => actions[candidate].eligible({ ...context, ...decision }));
    if (id) {
      append(id, {
        activityId: decision.activityId,
        ...(decision.proposal ?? { reason: decision.reason }),
      });
    }
  }
  for (const id of otherActions) {
    if (actions[id].eligible(context)) append(id, travel && actions[id].type === "travel" ? { impact: travel } : {});
  }
  return { method: "rules", cityId: snapshot.cityId, dataMode: snapshot.mode, actions: cards } as const;
}
