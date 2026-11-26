import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { configuredOrigin, createHostedOperatorAccess, createLocalOperatorAccess } from "../../src/server/ai/access";
import { createLocalBudget, createSharedBudget, parseBudgetCaps } from "../../src/server/ai/budget";

const origin = new URL("https://saans.example");
const secret = "test-gateway-signing-secret-longer-than-32";
const seconds = 1_800_000_000;
const claims = { aud: origin.origin, sub: "verified-person-1", adult: true, region: "IN", iat: seconds, exp: seconds + 60 };
const caps = { projectMinute: 4, projectDay: 12, operatorMinute: 2 };

function assertion(value: unknown, key = secret) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

it("requires an exact signed, current assertion of adult eligibility and allowed region for hosted AI", () => {
  const authorize = createHostedOperatorAccess({ origin, secret, regions: new Set(["IN"]), now: () => seconds * 1000 })!;
  const request = (value: string, requestOrigin = origin.origin) => new Request(origin, {
    headers: { origin: requestOrigin, "x-saans-operator-assertion": value, "x-operator-adult": "true" },
  });
  expect(authorize(request(assertion(claims)))).toMatch(/^[a-f0-9]{64}$/);
  expect(authorize(request(assertion(claims)))).not.toContain(claims.sub);
  for (const invalid of [
    "", assertion(claims, "attacker"), assertion({ ...claims, adult: false }),
    assertion({ ...claims, region: "XX" }), assertion({ ...claims, aud: "https://other.example" }),
    assertion({ ...claims, iat: seconds - 60, exp: seconds }),
    assertion({ ...claims, iat: seconds + 6, exp: seconds + 30 }),
    assertion({ ...claims, exp: seconds + 61 }),
  ]) expect(authorize(request(invalid))).toBeNull();
  expect(authorize(request(assertion(claims), "https://other.example"))).toBeNull();
  expect(createHostedOperatorAccess({ origin, secret: "", regions: new Set(["IN"]), now: Date.now })).toBeUndefined();
});

it("requires a local bearer credential with matching loopback origin and Host", () => {
  const local = configuredOrigin("http://127.0.0.1:3000")!;
  const authorize = createLocalOperatorAccess(local, secret)!;
  const request = (host: string, token: string) => new Request(local, {
    headers: { origin: local.origin, host, authorization: `Bearer ${token}` },
  });
  expect(authorize(request(local.host, secret))).toBe("local-operator");
  expect(authorize(request(local.host, "bad-token"))).toBeNull();
  expect(authorize(request("public.example", secret))).toBeNull();
  expect(createLocalOperatorAccess(origin, secret)).toBeUndefined();
  expect(configuredOrigin("https://saans.example/path")).toBeNull();
});

it("enforces local operator and daily limits at UTC window boundaries", async () => {
  let time = 0;
  const reserve = createLocalBudget({ projectMinute: 2, projectDay: 2, operatorMinute: 1 }, () => time);
  const take = () => reserve("local-operator", new AbortController().signal);
  expect(await Promise.all([take(), take()])).toEqual([true, false]);
  time += 60_000;
  expect(await take()).toBe(true);
  time += 60_000;
  expect(await take()).toBe(false);
  time = 86_400_000;
  expect(await take()).toBe(true);
  expect(parseBudgetCaps("4", "12", "2")).toEqual(caps);
  expect(parseBudgetCaps("0", "12", "2")).toBeNull();
  expect(parseBudgetCaps("1", "12", "2")).toBeNull();
});

it("uses one shared atomic reservation for the project minute, UTC day and pseudonymous operator budgets", async () => {
  const operator = "e".repeat(64);
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ result: 1 }))
    .mockResolvedValueOnce(Response.json({ result: 0 }))
    .mockResolvedValueOnce(Response.json({ result: 1, error: "invalid" }));
  const budget = createSharedBudget({
    url: "https://limit-example.upstash.io", token: "test", namespace: "gemini-project", caps, fetcher,
  })!;
  const signal = new AbortController().signal;
  expect(await budget(operator, signal)).toBe(true);
  expect(await budget(operator, signal)).toBe(false);
  expect(await budget(operator, signal)).toBe(false);
  expect(await budget(claims.sub, signal)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const [endpoint, options] = fetcher.mock.calls[0] ?? [];
  expect(String(endpoint)).toBe("https://limit-example.upstash.io/");
  expect(options).toMatchObject({ redirect: "error", method: "POST", signal });
  const command = JSON.parse(String(options?.body));
  expect(command).toEqual(["EVAL", expect.stringContaining("redis.call('TIME')"), 3,
    "saans:{gemini-project}:project:minute", "saans:{gemini-project}:project:day",
    `saans:{gemini-project}:operator:${operator}:minute`, 4, 12, 2]);
  for (const url of ["http://limit-example.upstash.io", "https://upstash.io.other.example", "https://limit-example.upstash.io/path"]) {
    expect(createSharedBudget({ url, token: "test", namespace: "shared", caps, fetcher })).toBeUndefined();
  }
});
