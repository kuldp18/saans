import { afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { delhiGoldenInput } from "../../src/catalog/delhi-golden";
import { DELHI_DEMO_ANCHOR, delhiSample } from "../../src/catalog/delhi-demo";
import { airSnapshotSchema, HOUR_MS } from "../../src/domain/air";
import { presentAir } from "../../src/domain/air-presentation";
import type { PlanResult } from "../../src/domain/plan/result";
import { buildRulesPlan } from "../../src/domain/plan/rules";
import { createGeminiProvider, defaultGeminiModel } from "../../src/server/ai/gemini";
import { createAiRanker, type RankingProvider, type RankingScenario } from "../../src/server/ai/rank";
import { createOperatorRanker } from "../../src/server/ai/runtime";
import { createPlanHandler } from "../../src/server/http/plan-handler";
import { createRequestGate } from "../../src/server/http/rate-limit";

const now = Date.parse(DELHI_DEMO_ANCHOR);
const origin = "https://saans.example";
const live = airSnapshotSchema.parse({
  ...delhiSample,
  mode: "live-model",
  sourceId: "OPEN-METEO-AIR",
  fetchedAt: new Date(now).toISOString(),
  hourly: delhiSample.hourly.map((bin, index) => ({
    ...bin, validAt: new Date(Math.floor(now / HOUR_MS) * HOUR_MS + index * HOUR_MS).toISOString(),
  })),
});
const rules = buildRulesPlan(delhiGoldenInput, live, now);
const air = presentAir(live, now);
const input = { city: "delhi", mode: "live", profile: delhiGoldenInput };
const authorization = () => "verified-operator";
const reserve = async () => true;

function request(body = input, headerOrigin = origin) {
  return new Request(`${origin}/api/plan`, {
    method: "POST", headers: { "content-type": "application/json", origin: headerOrigin }, body: JSON.stringify(body),
  });
}

function ranked(scenario: RankingScenario) {
  const [first, second, ...rest] = scenario.candidates;
  if (!first || !second) throw new Error("Expected two rankable candidates");
  const pair = ({ id, reasons }: RankingScenario["candidates"][number]): [string, string] => {
    const reason = reasons.at(-1);
    if (!reason) throw new Error("Expected an approved reason");
    return [id, reason];
  };
  const order: [[string, string], [string, string], ...[string, string][]] = [pair(second), pair(first), ...rest.map(pair)];
  return { order };
}

function handler(rank: ReturnType<typeof createAiRanker>, gate = () => 0) {
  return createPlanHandler({ getAir: async (_, mode) => mode === "demo" ? delhiSample : live, now: () => now, rank, gate, origin });
}

afterEach(() => vi.useRealTimers());

it("reorders visible eligible cards and pairs a local reason while preserving calculations and advisory priority", async () => {
  const provider = vi.fn<RankingProvider>().mockImplementation(async (scenario) => ranked(scenario));
  const quota = vi.fn(reserve);
  const response = await handler(createAiRanker({ authorize: authorization, reserve: quota, provider }))(request());
  const result: PlanResult = await response.json();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(result.plan.method).toBe("ai-ranked");
  expect(result.air).toEqual(air);
  expect(result.plan.actions.map(({ id }) => id)).toEqual([
    "check-local-advisory", rules.actions[2]?.id, rules.actions[1]?.id, ...rules.actions.slice(3).map(({ id }) => id),
  ]);
  expect(result.plan.actions[0]).toEqual(rules.actions[0]);
  expect(result.plan.actions[1]?.approvedReason).toBe("alternate");
  for (const { approvedReason, ...card } of result.plan.actions) {
    expect(rules.actions).toContainEqual(card);
    if (approvedReason) expect(approvedReason).toBe("alternate");
  }
  const [scenario] = provider.mock.calls[0] ?? [];
  if (!scenario) throw new Error("Expected a provider call");
  expect(scenario.severity).toBe("Very unhealthy");
  expect(Object.keys(scenario)).toEqual(["severity", "candidates"]);
  expect(JSON.stringify(scenario)).not.toMatch(/delhi|2026|08:30|no-purchases|car-1|school-pickup|filter|cautious|vehicle-km/i);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(quota).toHaveBeenCalledTimes(1);
});

it("runs public demo rules even with authorized context and rejects forged browser AI flags", async () => {
  const authorize = vi.fn(authorization);
  const quota = vi.fn(reserve);
  const provider = vi.fn<RankingProvider>();
  const post = handler(createAiRanker({ authorize, reserve: quota, provider }));
  expect(await (await post(request({ ...input, mode: "demo" }))).json()).toMatchObject({ plan: { method: "rules" } });
  const forged = { ...input, mode: "demo", ai: true };
  expect((await post(request(forged))).status).toBe(400);
  expect(authorize).not.toHaveBeenCalled();
  expect(quota).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
});

it.each(["duplicate", "unknown", "cross-pair", "missing", "cross-group", "prose"] as const)(
  "discards the entire response on %s",
  async (failure) => {
    const provider = vi.fn<RankingProvider>().mockImplementation(async (scenario) => {
      const output = ranked(scenario);
      if (failure === "duplicate") output.order[1] = output.order[0];
      if (failure === "unknown") output.order[0][0] = "a7";
      if (failure === "cross-pair") output.order[0][1] = output.order[1][1];
      if (failure === "missing") output.order.pop();
      if (failure === "cross-group") output.order.reverse();
      if (failure === "prose") return { ...output, explanation: "unapproved text" };
      return output;
    });
    const rank = createAiRanker({ authorize: authorization, reserve, provider });
    expect(await rank(request(), "live", rules, air)).toEqual({ plan: rules, aiUnavailable: true });
    expect(provider).toHaveBeenCalledTimes(1);
  },
);

it("falls back on missing key, refused and failed quotas or absent operator access", async () => {
  expect(createGeminiProvider({ apiKey: "", model: defaultGeminiModel, fetcher: vi.fn() })).toBeUndefined();
  const provider = vi.fn<RankingProvider>();
  const fallback = { plan: rules, aiUnavailable: true };
  expect(await createAiRanker({ authorize: authorization, reserve })(request(), "live", rules, air)).toEqual(fallback);
  expect(await createAiRanker({ authorize: authorization, provider })(request(), "live", rules, air)).toEqual(fallback);
  expect(await createAiRanker({ authorize: () => null, reserve, provider })(request(), "live", rules, air)).toEqual({ plan: rules });
  for (const quota of [async () => false, async () => { throw new Error("quota unavailable"); }]) {
    expect(await createAiRanker({ authorize: authorization, reserve: quota, provider })(request(), "live", rules, air))
      .toEqual(fallback);
  }
  expect(provider).not.toHaveBeenCalled();
});

it("aborts a stalled Gemini fetch and never retries it", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Promise(() => {}));
  const provider = createGeminiProvider({ apiKey: "test-key", model: defaultGeminiModel, fetcher });
  const rank = createAiRanker({ authorize: authorization, reserve, provider, limitMs: 40 });
  const pending = rank(request(), "live", rules, air);
  await vi.advanceTimersByTimeAsync(40);
  expect(await pending).toEqual({ plan: rules, aiUnavailable: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
  expect(init?.signal?.aborted).toBe(true);
  expect(init?.redirect).toBe("error");
  expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-key" });
  expect(JSON.parse(String(init?.body)).generationConfig).toMatchObject({
    candidateCount: 1, maxOutputTokens: 256, responseMimeType: "application/json",
  });
});

it("aborts a stalled quota before the provider can be called", async () => {
  vi.useFakeTimers();
  const quota = vi.fn<(operator: string, signal: AbortSignal) => Promise<boolean>>()
    .mockImplementation(async () => new Promise((resolve) => { setTimeout(() => resolve(true), 80); }));
  const provider = vi.fn<RankingProvider>();
  const pending = createAiRanker({ authorize: authorization, reserve: quota, provider, limitMs: 40 })(request(), "live", rules, air);
  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toEqual({ plan: rules, aiUnavailable: true });
  expect(quota.mock.calls[0]?.[1].aborted).toBe(true);
  expect(provider).not.toHaveBeenCalled();
});

it.each([
  () => new Response(null, { status: 429 }),
  () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
  () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
  () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "broken JSON" }] } }] }),
  () => new Response(" ".repeat(16 * 1024 + 1)),
])("falls back on rejected, blocked, truncated, invalid or oversized Gemini responses (%#)", async (response) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
  const provider = createGeminiProvider({ apiKey: "test", model: defaultGeminiModel, fetcher });
  expect(await createAiRanker({ authorize: authorization, reserve, provider })(request(), "live", rules, air))
    .toEqual({ plan: rules, aiUnavailable: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("accepts one bounded completed JSON response from a configurable Flash-Lite endpoint", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
    const scenario = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text) as RankingScenario;
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(ranked(scenario)) }] } }] });
  });
  const provider = createGeminiProvider({ apiKey: "test-key", model: "gemini-3.1-flash-lite-preview", fetcher });
  expect(await createAiRanker({ authorize: authorization, reserve, provider })(request(), "live", rules, air))
    .toMatchObject({ plan: { method: "ai-ranked" } });
  expect(fetcher.mock.calls[0]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent");
  expect(createGeminiProvider({ apiKey: "test", model: "../other", fetcher })).toBeUndefined();
});

it("rejects cross-origin requests and resets the public gate at the next minute", async () => {
  let time = 59_000;
  const post = handler(createAiRanker({ authorize: () => null }), createRequestGate(1, () => time));
  expect((await post(request(input, "https://elsewhere.example"))).status).toBe(403);
  expect((await post(request())).status).toBe(200);
  const limited = await post(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("1");
  time = 60_000;
  expect((await post(request())).status).toBe(200);
});

it("requires verified hosted configuration and a shared reservation at runtime", async () => {
  const secret = "test-gateway-key-for-runtime-configuration";
  const seconds = now / 1000;
  const claims = Buffer.from(JSON.stringify({
    aud: origin, sub: "verified-operator", adult: true, region: "IN", iat: seconds, exp: seconds + 30,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(claims).digest("base64url");
  const signed = new Request(origin, { headers: { origin, "x-saans-operator-assertion": `${claims}.${signature}` } });
  const config: NodeJS.ProcessEnv = {
    NODE_ENV: "production", APP_ORIGIN: origin, AI_MODE: "operator-hosted", AI_ELIGIBILITY_VERIFIED: "1",
    AI_ALLOWED_REGIONS: "IN", AI_GATEWAY_SECRET: secret, GEMINI_API_KEY: "test-key",
    AI_PROJECT_PER_MINUTE: "9", AI_PROJECT_PER_DAY: "50", AI_OPERATOR_PER_MINUTE: "3",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "test", AI_BUDGET_NAMESPACE: "test",
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (String(url) === "https://example.upstash.io/") return Response.json({ result: 1 });
    const scenario = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text) as RankingScenario;
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(ranked(scenario)) }] } }] });
  });
  const run = (overrides: Partial<NodeJS.ProcessEnv>, req = signed) => createOperatorRanker({ ...config, ...overrides }, { fetcher, now: () => now })
    (req, "live", rules, air);
  expect(await run({ AI_ELIGIBILITY_VERIFIED: "0" })).toEqual({ plan: rules });
  expect(await run({ APP_ORIGIN: "invalid" })).toEqual({ plan: rules });
  expect(await run({ AI_ALLOWED_REGIONS: "IN," })).toEqual({ plan: rules });
  expect(await run({ AI_ALLOWED_REGIONS: undefined })).toEqual({ plan: rules });
  expect(await run({ AI_GATEWAY_SECRET: "" })).toEqual({ plan: rules });
  expect(await run({ AI_MODE: "off" })).toEqual({ plan: rules });
  expect(await run({}, request())).toEqual({ plan: rules });
  expect(await run({ UPSTASH_REDIS_REST_TOKEN: "" })).toEqual({ plan: rules, aiUnavailable: true });
  expect(await run({ AI_PROJECT_PER_MINUTE: "" })).toEqual({ plan: rules, aiUnavailable: true });
  expect(await run({ GEMINI_API_KEY: undefined })).toEqual({ plan: rules, aiUnavailable: true });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await run({ GEMINI_MODEL: "gemini-3.1-flash-lite" })).toMatchObject({ plan: { method: "ai-ranked" } });
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).hostname))
    .toEqual(["example.upstash.io", "generativelanguage.googleapis.com"]);
});

it("allows local operator configuration only in development with verified access and caps", async () => {
  const local = "http://127.0.0.1:3000";
  const token = "test-token-only-for-local-verification";
  const config: NodeJS.ProcessEnv = {
    NODE_ENV: "development", APP_ORIGIN: local, AI_MODE: "operator-local", AI_ELIGIBILITY_VERIFIED: "1",
    AI_LOCAL_OPERATOR_TOKEN: token, GEMINI_API_KEY: "test-key",
    AI_PROJECT_PER_MINUTE: "2", AI_PROJECT_PER_DAY: "4", AI_OPERATOR_PER_MINUTE: "1",
  };
  const req = new Request(local, {
    headers: { origin: local, host: "127.0.0.1:3000", authorization: `Bearer ${token}` },
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
  const run = (overrides: Partial<NodeJS.ProcessEnv>) => createOperatorRanker({ ...config, ...overrides }, { fetcher, now: () => now })
    (req, "live", rules, air);
  expect(await run({ NODE_ENV: "production" })).toEqual({ plan: rules });
  expect(await run({ AI_LOCAL_OPERATOR_TOKEN: undefined })).toEqual({ plan: rules });
  expect(await run({ AI_PROJECT_PER_DAY: "" })).toEqual({ plan: rules, aiUnavailable: true });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await run({})).toEqual({ plan: rules, aiUnavailable: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
