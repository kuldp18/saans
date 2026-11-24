import { rankOperatorPlan } from "@/server/ai/runtime";
import { airClock, getAir } from "@/server/air/runtime";
import { createPlanHandler } from "@/server/http/plan-handler";
import { createRequestGate } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const POST = createPlanHandler({
  getAir, now: airClock, rank: rankOperatorPlan,
  gate: createRequestGate(120), origin: process.env.APP_ORIGIN,
});
