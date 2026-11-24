import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const origin = process.argv[2] ?? "http://127.0.0.1:3000";
assert.match(origin, /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/);

const fixture = {
  city: "delhi", mode: "demo", profile: {
    persona: "household", cautious: false, budget: "no-purchases", suitableFilter: "unavailable",
    indoorVenueAvailable: false,
    activities: [
      {
        activityId: "school-pickup", flexibility: "fixed",
        start: "2026-01-15T15:00:00+05:30", end: "2026-01-15T15:30:00+05:30",
      },
      {
        activityId: "errand", flexibility: "flexible",
        start: "2026-01-15T08:30:00+05:30", end: "2026-01-15T09:30:00+05:30",
        earliestStart: "2026-01-15T08:00:00+05:30", latestEnd: "2026-01-15T14:30:00+05:30",
      },
    ],
    travel: {
      kind: "consolidate", feasible: true,
      baseline: [{ vehicleId: "car-1", km: 16 }], proposed: [{ vehicleId: "car-1", km: 10 }],
    },
  },
};
const warmup = 10;
const samples = 60;
const postOptions = {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify(fixture),
};

async function measure(path, options, validate) {
  const timings = [];
  for (let index = 0; index < warmup + samples; index++) {
    const start = performance.now();
    const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(5_000) });
    const data = await response.json();
    const elapsed = performance.now() - start;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    validate(data);
    if (index >= warmup) timings.push(elapsed);
  }
  timings.sort((a, b) => a - b);
  const percentile = (percent) => Number(timings[Math.ceil(percent * samples) - 1].toFixed(2));
  console.log(JSON.stringify({ path, warmup, samples, concurrency: 1, p50Ms: percentile(0.5), p95Ms: percentile(0.95) }));
}

await measure("/api/air?city=delhi&mode=demo", undefined, ({ mode, hourly }) => {
  assert.equal(mode, "demo");
  assert.equal(hourly.length, 12);
});

await measure("/api/plan", postOptions, ({ plan }) => {
  assert.equal(plan.method, "rules");
  assert.deepEqual(plan.actions.filter(({ impact }) => impact).map(({ impact }) => [impact.baseline, impact.proposed]), [[110, 50], [16, 10]]);
});

for (const [expected, overrides] of [
  [403, { headers: { ...postOptions.headers, Origin: "https://cross-origin.example" } }],
  [400, { body: "{" }],
  [400, { body: JSON.stringify({ ...fixture, ai: true }) }],
  [413, { body: " ".repeat(4097) }],
  [415, { headers: { ...postOptions.headers, "Content-Type": "text/plain" } }],
]) {
  const response = await fetch(origin + "/api/plan", { ...postOptions, ...overrides, signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, expected);
  assert.equal(response.headers.get("cache-control"), "no-store");
  console.log(JSON.stringify({ status: response.status, code: (await response.json()).error.code }));
}
