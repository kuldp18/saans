import { presentAir } from "../../domain/air-presentation";
import type { CityId } from "../../catalog/cities";
import type { AirSnapshot, RequestedAirMode } from "../../domain/air";
import { buildCommunityNotice } from "../../domain/plan/notice";
import type { PlanResult } from "../../domain/plan/result";
import { buildRulesPlan } from "../../domain/plan/rules";
import type { createAiRanker } from "../ai/rank";
import { allowsPlanOrigin, readPlanRequest } from "./plan-request";

const headers = { "Cache-Control": "no-store" };

export function createPlanHandler({ getAir, now, rank, gate, origin }: {
  getAir: (city: CityId, mode: RequestedAirMode) => Promise<AirSnapshot>;
  now: () => number;
  rank: ReturnType<typeof createAiRanker>;
  gate: () => number;
  origin: string | undefined;
}) {
  return async function POST(request: Request) {
    if (!allowsPlanOrigin(request, origin)) {
      return Response.json({ error: { code: "origin_denied" } }, { status: 403, headers });
    }
    const retry = gate();
    if (retry) {
      return Response.json({ error: { code: "rate_limited" } }, {
        status: 429, headers: { ...headers, "Retry-After": String(retry) },
      });
    }
    const input = await readPlanRequest(request);
    if (!input.ok) return Response.json({ error: input.error }, { status: input.status, headers });

    const snapshot = await getAir(input.city, input.mode);
    const time = now();
    const air = presentAir(snapshot, time);
    const rules = buildRulesPlan(input.profile, snapshot, time);
    const ranked = await rank(request, input.mode, rules, air);
    const result: PlanResult = { ...ranked, air };
    if (input.profile.persona === "community") result.notice = buildCommunityNotice(result.plan, air);
    return Response.json(result, { headers });
  };
}
