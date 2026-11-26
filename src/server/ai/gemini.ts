import "server-only";
import { z } from "zod";
import { readBoundedJson } from "../http/bounded-json";
import type { RankingProvider } from "./rank";

const HOST = "https://generativelanguage.googleapis.com";
export const defaultGeminiModel = "gemini-3.1-flash-lite";
const maxResponseBytes = 16 * 1024;
const prompt = [
  "Saans ranking v1. Rank only the supplied eligible cards within each group.",
  "Keep groups in routine, indoor, travel order. Include every candidate exactly once.",
  "Return order as pairs of candidate ID and one of that candidate's approved reason IDs.",
  "Use the severity and generic categories to prioritize practical choices. Return IDs only.",
].join(" ");

const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.tuple([z.object({
    finishReason: z.literal("STOP"),
    content: z.object({
      parts: z.tuple([z.strictObject({
        text: z.string().min(1).max(2048),
        thought: z.literal(false).optional(),
        thoughtSignature: z.string().optional(),
      })]),
    }),
  })]),
});

export function createGeminiProvider({ apiKey, model, fetcher }: {
  apiKey: string; model: string; fetcher: typeof fetch;
}): RankingProvider | undefined {
  if (!apiKey.trim() || !/^gemini-[0-9]+(?:\.[0-9]+)?-flash-lite(?:-[a-z0-9]+)*$/.test(model) || model.length > 80) {
    return undefined;
  }
  const endpoint = `${HOST}/v1beta/models/${model}:generateContent`;
  return async (scenario, signal) => {
    const count = scenario.candidates.length;
    const ids = scenario.candidates.map(({ id }) => id);
    const reasons = scenario.candidates.flatMap((candidate) => candidate.reasons);
    const response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(scenario) }] }],
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
          ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "MINIMAL" } } : {}),
          responseJsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["order"],
            properties: {
              order: {
                type: "array", minItems: count, maxItems: count,
                items: {
                  type: "array", minItems: 2, maxItems: 2,
                  prefixItems: [{ type: "string", enum: ids }, { type: "string", enum: reasons }],
                },
              },
            },
          },
        },
      }),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > maxResponseBytes) {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    const parsed = responseSchema.safeParse(await readBoundedJson(response.body, maxResponseBytes, signal));
    if (!parsed.success || parsed.data.promptFeedback?.blockReason) return null;
    return JSON.parse(parsed.data.candidates[0].content.parts[0].text) as unknown;
  };
}
