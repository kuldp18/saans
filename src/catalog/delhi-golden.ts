import { parsePlanInput, type PlanInput } from "../domain/plan/input";

const scenario = {
  persona: "household",
  activities: [
    {
      activityId: "school-pickup",
      flexibility: "fixed",
      start: "2026-01-15T15:00:00+05:30",
      end: "2026-01-15T15:30:00+05:30",
    },
    {
      activityId: "errand",
      flexibility: "flexible",
      start: "2026-01-15T08:30:00+05:30",
      end: "2026-01-15T09:30:00+05:30",
      earliestStart: "2026-01-15T08:00:00+05:30",
      latestEnd: "2026-01-15T14:30:00+05:30",
    },
  ],
  cautious: false,
  budget: "no-purchases",
  suitableFilter: "unavailable",
  indoorVenueAvailable: false,
  travel: {
    kind: "consolidate",
    feasible: true,
    baseline: [{ vehicleId: "car-1", km: 16 }],
    proposed: [{ vehicleId: "car-1", km: 10 }],
  },
} satisfies PlanInput;

const parsed = parsePlanInput(scenario);
if (!parsed.success) throw parsed.error;
export const delhiGoldenInput = parsed.data;
