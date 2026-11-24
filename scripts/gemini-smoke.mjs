const env = process.env;
const origin = env.APP_ORIGIN ?? "";
const loopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(origin);
const caps = [env.AI_PROJECT_PER_MINUTE, env.AI_PROJECT_PER_DAY, env.AI_OPERATOR_PER_MINUTE];
const authorized = env.AI_SMOKE_AUTHORIZED === "1" && env.AI_ELIGIBILITY_VERIFIED === "1" &&
  env.AI_MODE === "operator-local" && loopback && !!env.GEMINI_API_KEY?.trim() &&
  (env.AI_LOCAL_OPERATOR_TOKEN?.length ?? 0) >= 32 && caps.every((cap) => /^[1-9]\d{0,5}$/.test(cap ?? ""));

if (!authorized) {
  console.log("Skipped Gemini smoke test. No authorized eligible local configuration was supplied.");
} else {
  // A fixed synthetic routine gives the operator path two eligible routine cards to rank.
  const profile = {
    persona: "household",
    activities: [
      { activityId: "school-pickup", flexibility: "fixed", start: "2026-01-15T08:30:00+05:30", end: "2026-01-15T09:00:00+05:30" },
      { activityId: "errand", flexibility: "fixed", start: "2026-01-15T13:30:00+05:30", end: "2026-01-15T14:00:00+05:30" },
    ],
    cautious: false,
    budget: "no-purchases",
    suitableFilter: "unavailable",
    indoorVenueAvailable: false,
  };
  try {
    const response = await fetch(`${origin}/api/plan`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", Authorization: `Bearer ${env.AI_LOCAL_OPERATOR_TOKEN}` },
      body: JSON.stringify({ city: "delhi", mode: "live", profile }),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    const result = response.ok ? await response.json() : null;
    if (result?.plan?.method === "ai-ranked") {
      console.log("Gemini smoke test passed. The server accepted one validated ranking.");
    } else {
      console.log(`Gemini smoke did not return an AI-ranked plan (HTTP ${response.status}).`);
      process.exitCode = 1;
    }
  } catch {
    console.log("Gemini smoke could not reach the local planner within its deadline.");
    process.exitCode = 1;
  }
}
