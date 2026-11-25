import { expect, it } from "vitest";
import { delhiGoldenInput } from "../../src/catalog/delhi-golden";
import { readBoundedJson } from "../../src/server/http/bounded-json";
import { allowsPlanOrigin, readPlanRequest } from "../../src/server/http/plan-request";

const payload = { city: "delhi", mode: "demo", profile: delhiGoldenInput };
function request(body: string, headers: HeadersInit = { "content-type": "application/json" }) {
  return new Request("http://localhost:3417/api/plan", { method: "POST", headers, body });
}

it("allows the configured origin or an exact loopback Host for local no-key use", () => {
  const local = request("{}", { origin: "http://127.0.0.1:3417", host: "127.0.0.1:3417" });
  expect(allowsPlanOrigin(local, undefined)).toBe(true);
  expect(allowsPlanOrigin(local, "https://saans.example")).toBe(false);
  expect(allowsPlanOrigin(request("{}", { origin: "https://saans.example" }), "https://saans.example")).toBe(true);
  expect(allowsPlanOrigin(request("{}", { origin: "https://saans.example", host: "saans.example" }), undefined)).toBe(false);
  expect(allowsPlanOrigin(request("{}", { origin: "http://127.0.0.1:3417", host: "localhost:3417" }), undefined)).toBe(false);
  expect(allowsPlanOrigin(request("{}"), undefined)).toBe(false);
});

it("allows local aliases only on the configured port and matching request Host", () => {
  const origin = "http://127.0.0.1:3000";
  const check = (browserOrigin: string, host: string) =>
    allowsPlanOrigin(request("{}", { origin: browserOrigin, host }), origin);
  expect(check("http://localhost:3000", "localhost:3000")).toBe(true);
  expect(check("http://[::1]:3000", "[::1]:3000")).toBe(true);
  expect(check("http://localhost:3001", "localhost:3001")).toBe(false);
  expect(check("http://localhost:3000", "127.0.0.1:3000")).toBe(false);
  expect(check("http://127.0.0.1:3000", "saans.example")).toBe(false);
  expect(check("http://example.com:3000", "example.com:3000")).toBe(false);
});

it("validates a demo request and rejects invalid mode, forged flags, and profile fields", async () => {
  expect(await readPlanRequest(request(JSON.stringify(payload)))).toEqual({
    ok: true, city: "delhi", mode: "demo", profile: delhiGoldenInput,
  });
  for (const invalid of [{ ...payload, city: "noida" }, { ...payload, ai: true }]) {
    expect(await readPlanRequest(request(JSON.stringify(invalid)))).toMatchObject({ ok: false, status: 400 });
  }
  expect(await readPlanRequest(request(JSON.stringify({
    ...payload, profile: { ...payload.profile, budget: "any" },
  })))).toMatchObject({ status: 400, error: { issues: [{ pointer: "/profile/budget" }] } });
});

it("rejects malformed, non-JSON and oversized requests even with an understated content length", async () => {
  const empty = new Request("http://localhost:3417/api/plan", {
    method: "POST", headers: { "content-type": "application/json" },
  });
  expect(await readPlanRequest(empty)).toMatchObject({ status: 400, error: { code: "invalid_json" } });
  expect(await readPlanRequest(request("{"))).toMatchObject({ status: 400, error: { code: "invalid_json" } });
  expect(await readPlanRequest(request("{}", { "content-type": "text/plain" }))).toMatchObject({ status: 415 });
  expect(await readPlanRequest(request(" ".repeat(4097), {
    "content-type": "application/json", "content-length": "1",
  }))).toMatchObject({ status: 413, error: { code: "body_too_large" } });
});

it("cancels a pending streamed read when its deadline signal aborts", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise(() => {}),
    cancel: () => { cancelled = true; },
  });
  const controller = new AbortController();
  const pending = readBoundedJson(body, 4096, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});
