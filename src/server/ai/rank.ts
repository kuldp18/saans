import "server-only";
import { z } from "zod";
import { actions, type ActionId } from "../../catalog/actions";
import { alternateReasons } from "../../catalog/action-reasons";
import { usAqiBand, type RequestedAirMode } from "../../domain/air";
import type { AirPresentation } from "../../domain/air-presentation";
import type { PlanResult } from "../../domain/plan/result";
import type { buildRulesPlan } from "../../domain/plan/rules";
import { withDeadline } from "../http/bounded-json";

type RulesPlan = ReturnType<typeof buildRulesPlan>;
type RankResult = Pick<PlanResult, "plan" | "aiUnavailable">;
const deadlineMs = 4_000;
const groups = ["routine", "indoor", "travel"] as const;

const categories: Record<Exclude<ActionId, "check-local-advisory">, string> = {
  "keep-commitment": "keep commitment",
  "shift-flexible-activity": "adjust routine",
  "move-activity-indoors": "adjust venue",
  "pause-outdoor-activity": "pause exertion",
  "skip-incense-and-candles": "indoor source control",
  "use-particle-filter": "indoor air management",
  "consider-particle-filter": "indoor air management",
  "combine-car-trips": "combine travel",
  "replace-car-trip": "replace travel",
};

const rankingSchema = z.strictObject({
  order: z.array(z.tuple([z.string().regex(/^a[0-7]$/), z.string().regex(/^r[0-7][ab]$/)])).min(2).max(8),
});

export type RankingScenario = {
  severity: string;
  candidates: { id: string; group: (typeof groups)[number]; category: string; reasons: string[] }[];
};
export type RankingProvider = (scenario: RankingScenario, signal: AbortSignal) => Promise<unknown>;

function prepare(plan: RulesPlan, air: AirPresentation) {
  const candidates = plan.actions.flatMap((action) => {
    if (action.id === "check-local-advisory") return [];
    const group = actions[action.id].type;
    return [{ action, group, category: categories[action.id] }];
  }).sort((first, second) => groups.indexOf(first.group) - groups.indexOf(second.group));
  if (candidates.length > 8 || !groups.some((group) => candidates.filter((candidate) => candidate.group === group).length > 1)) return null;
  const lookup = new Map(candidates.map(({ action, group, category }, i) => {
    const id = `a${i}`;
    const reasons = alternateReasons[action.id] ? [`r${i}a`, `r${i}b`] : [`r${i}a`];
    return [id, { action, candidate: { id, group, category, reasons } }];
  }));
  const scenario: RankingScenario = {
    severity: air.mode === "live-model" ? usAqiBand(air.hour?.usAqi ?? null) ?? "unavailable" : "unavailable",
    candidates: [...lookup.values()].map(({ candidate }) => candidate),
  };
  return { scenario, lookup };
}

export function createAiRanker({
  authorize, reserve, provider, limitMs = deadlineMs,
}: {
  authorize: (request: Request) => string | null;
  reserve?: (operator: string, signal: AbortSignal) => Promise<boolean>;
  provider?: RankingProvider;
  limitMs?: number;
}) {
  return async (request: Request, mode: RequestedAirMode, plan: RulesPlan, air: AirPresentation): Promise<RankResult> => {
    if (mode === "demo") return { plan };
    const operator = authorize(request);
    if (!operator) return { plan };
    const prepared = prepare(plan, air);
    if (!prepared) return { plan };
    const fallback = { plan, aiUnavailable: true } as const;
    if (!reserve || !provider) return fallback;

    try {
      return await withDeadline(limitMs, async (signal) => {
        if (!(await reserve(operator, signal))) return fallback;
        signal.throwIfAborted();
        const parsed = rankingSchema.safeParse(await provider(prepared.scenario, signal));
        signal.throwIfAborted();
        if (!parsed.success || parsed.data.order.length !== prepared.lookup.size) return fallback;
        const used = new Set<string>();
        let group = -1;
        const ranked = plan.actions.filter(({ id }) => id === "check-local-advisory");
        for (const [id, reason] of parsed.data.order) {
          const item = prepared.lookup.get(id);
          if (!item || used.has(id) || !item.candidate.reasons.includes(reason)) return fallback;
          const position = groups.indexOf(item.candidate.group);
          if (position < group) return fallback;
          group = position;
          used.add(id);
          ranked.push(reason.endsWith("b") ? { ...item.action, approvedReason: "alternate" } : item.action);
        }
        return { plan: { ...plan, method: "ai-ranked", actions: ranked } };
      });
    } catch {
      return fallback;
    }
  };
}
