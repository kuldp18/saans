# Gemini operator access

Delhi sample requests always return Rules plans. Operator mode can rank eligible cards within the routine, indoor, and travel sections. The prompt `Saans ranking v1` carries broad categories, a public severity band, and temporary candidate and rationale IDs. Source data, advisory priority, schedules, and calculations come from the rules engine.

## Local smoke test

An administrator must verify the adult operator, current regional and project eligibility, applicable terms, model access, and observed project quota before enabling this mode. Check the [Gemini API terms](https://ai.google.dev/gemini-api/terms), [available regions](https://ai.google.dev/gemini-api/docs/available-regions), and [quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

- In an untracked `.env.local`, set `AI_MODE=operator-local`, `AI_ELIGIBILITY_VERIFIED=1`, and an exact loopback `APP_ORIGIN`, such as `http://127.0.0.1:3000`. Set `GEMINI_API_KEY` and a randomly generated `AI_LOCAL_OPERATOR_TOKEN` of at least 32 characters. Set positive `AI_OPERATOR_PER_MINUTE`, `AI_PROJECT_PER_MINUTE`, and `AI_PROJECT_PER_DAY` limits within the verified quota, in that order of size.
- Start `npm run dev -- --hostname 127.0.0.1`. For one explicitly authorized smoke run, set `AI_SMOKE_AUTHORIZED=1` in the invoking shell and run `node --env-file=.env.local scripts/gemini-smoke.mjs`. The script uses a synthetic routine through the local operator endpoint. Its output reports only success, fallback, or a skipped attempt.

## Hosted prerequisites

Host the operator experience behind an access gateway that verifies adult eligibility and current eligible geography. Configure the origin so clients cannot bypass the gateway on a hosted operator instance. Strip any incoming `X-Saans-Operator-Assertion` and have the gateway inject a signed assertion into `POST /api/plan` only after verification. Keep the assertion and secrets out of browser code and logs. The unrestricted demo uses `AI_MODE=off`.

Use `AI_MODE=operator-hosted`, `AI_ELIGIBILITY_VERIFIED=1`, an exact HTTPS `APP_ORIGIN`, and verified uppercase country codes in `AI_ALLOWED_REGIONS` separated by commas. The gateway assertion is `base64url(UTF-8 JSON).base64url(HMAC-SHA256(first segment))`. Use a dedicated shared `AI_GATEWAY_SECRET` of at least 32 random characters. Sign the fields `aud` (exact origin), `sub` (opaque stable operator ID), `adult` (true), `region` (verified country), `iat` and `exp` (UTC epoch seconds with a lifetime of at most 60 seconds). An unsigned header, a claimed age, and browser flags cannot enable ranking.

Set the three positive budget caps above and a stable `AI_BUDGET_NAMESPACE` per Gemini project. Every hosted instance and region for that project must share the same Upstash Redis REST database, namespace, and caps. Set `UPSTASH_REDIS_REST_URL` to the database’s exact HTTPS origin and set `UPSTASH_REDIS_REST_TOKEN`. Each attempt reserves all three counters in one Redis operation before calling Gemini. Minute windows and the UTC day reset on Redis time. Failed or timed-out Gemini calls consume their reservations. Keep one authoritative store through failover. If the counter history is lost, suspend operator AI until the current quota windows expire. The public API’s per-process limit is a coarse load guard. Apply public ingress limits at the host.

## Live verification

2026-11-25 local workspace. `node scripts/gemini-smoke.mjs` reported a skip because no authorized eligible configuration was supplied. No real Gemini or hosted Upstash request was made.

`npm run check` passed 78 tests with mocked transports. These verified reordering, rationale pairing, full Rules fallback, and zero Gemini calls for the public sample. `npm run build` passed. All 11 Playwright tests passed against the production build in Chrome, including nonce and response header checks.
