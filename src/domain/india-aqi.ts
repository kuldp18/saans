import { z } from "zod";

export const indiaAqiSchema = z.strictObject({
  value: z.int().min(0).max(500),
  validAt: z.iso.datetime(),
  sourceId: z.literal("CPCB-BULLETIN"),
  bulletinUrl: z.string().regex(/^https:\/\/(?:www\.)?cpcb\.gov\.in\/upload\/Downloads\/AQI_Bulletin_\d{8}\.pdf$/),
});

export type IndiaAqi = z.infer<typeof indiaAqiSchema>;

export function indiaAqiBand(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 500) return null;
  if (value <= 50) return "Good";
  if (value <= 100) return "Satisfactory";
  if (value <= 200) return "Moderate";
  if (value <= 300) return "Poor";
  if (value <= 400) return "Very Poor";
  return "Severe";
}
