import { z } from "zod";
import { cityIdSchema } from "../catalog/cities";

const entrySchema = z.object({
  city: cityIdSchema.optional(),
  mode: z.enum(["live", "demo"]).optional(),
});

export function resolvePlannerEntry(query: Record<string, string | string[] | undefined>) {
  const entry = entrySchema.safeParse(query);
  if (!entry.success) return { kind: "invalid" } as const;

  const { city, mode } = entry.data;
  if (mode === "demo") {
    return city === "delhi"
      ? { kind: "demo", city } as const
      : { kind: "invalid" } as const;
  }

  return city ? { kind: "live", city } as const : { kind: "choose-city" } as const;
}
