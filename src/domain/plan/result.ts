import type { AirPresentation } from "../air-presentation";
import type { buildRulesPlan } from "./rules";

export type PlanResult = {
  plan: Omit<ReturnType<typeof buildRulesPlan>, "method"> & { method: "rules" | "ai-ranked" };
  aiUnavailable?: true;
  air: AirPresentation;
  notice?: string;
};
