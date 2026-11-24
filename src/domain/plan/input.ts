import { z } from "zod";

const localTime = z.iso.datetime({ offset: true });
const activityFields = {
  activityId: z.enum(["school-pickup", "errand", "outdoor-group-activity"]),
  start: localTime,
  end: localTime,
};

const activity = z.discriminatedUnion("flexibility", [
  z.strictObject({ ...activityFields, flexibility: z.literal("fixed") }),
  z.strictObject({
    ...activityFields, flexibility: z.literal("flexible"),
    earliestStart: localTime, latestEnd: localTime,
  }),
]);

const journey = z.strictObject({
  vehicleId: z.enum(["car-1", "car-2", "car-3"]),
  km: z.number().positive().max(500),
});

export const travelSchema = z.strictObject({
  kind: z.enum(["consolidate", "replace"]),
  feasible: z.boolean(),
  baseline: z.array(journey).min(1).max(3),
  proposed: z.array(journey).max(3),
});
export type Travel = z.infer<typeof travelSchema>;

const planInputSchema = z.strictObject({
  persona: z.enum(["household", "community"]),
  activities: z.array(activity).min(1).max(3),
  cautious: z.boolean(),
  budget: z.enum(["no-purchases", "existing", "open"]),
  suitableFilter: z.enum(["available", "considering", "unavailable"]),
  indoorVenueAvailable: z.boolean(),
  travel: travelSchema.optional(),
}).superRefine(({ activities }, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of activities.entries()) {
    const start = Date.parse(item.start);
    const end = Date.parse(item.end);
    const duration = (end - start) / 60_000;
    if (seen.has(item.activityId) || start % (30 * 60_000) !== 0 ||
      duration < 30 || duration > 120 || !Number.isInteger(duration) ||
      (item.flexibility === "flexible" && (
        Date.parse(item.earliestStart) > start || Date.parse(item.latestEnd) < end
      ))) {
      ctx.addIssue({ code: "custom", path: ["activities", index], message: "Invalid activity or time bounds" });
    }
    seen.add(item.activityId);
  }
});

export type PlanInput = z.infer<typeof planInputSchema>;
export type Activity = PlanInput["activities"][number];
export const parsePlanInput = (input: unknown) => planInputSchema.safeParse(input);
