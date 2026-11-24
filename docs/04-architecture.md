# Architecture and deployment

## Stack and boundaries

Use Next.js App Router and Node runtime with strict TypeScript, Tailwind, Zod, native accessible controls, Vitest and Playwright with axe-core. Prefer server components outside interactive islands. Keep pure policy and arithmetic independent of Next.js, time, storage and network. Dependency-inject fetch, clock and providers for testability. Avoid a graphing library, map SDK, chat framework, user database, polling and client Gemini SDK. Use a pure TS domain, typed functions and small components. Vercel Hobby is suitable only if the event and usage qualify; otherwise use an approved Node host. Optional Upstash Redis supports hosted budgets and public-data caching, with a memory fake only for local tests.

## Endpoints

| Route | Inputs | Result |
| --- | --- | --- |
| GET /api/air?city=delhi&mode=demo | Allowlisted city ID and mode | Normalized city snapshot, no user profile. Missing live data yields explicit mode and no fake reading. |
| POST /api/plan | Strict JSON for city ID, data mode, persona, ≤3 activity enums, fixed/flexible local time boundaries, budget/mobility and equipment enums, bounded distance. No free text. | Plan cards with IDs, evidence, sourceId, calculated impacts, hydration-safe timestamps and method. Return Cache-Control: no-store. |
| GET /api/health | None | Minimal liveness only. No secrets, quota details or dependency payloads. |

Use pointer/code field errors and stable JSON error shape. Reject unexpected keys, duplicate query parameters where ambiguous, wrong media type, large streamed bodies (4 KiB cap regardless of claimed length), malformed JSON and invalid time ranges. Runtime supports city-local times via validated timestamps with explicit offsets. Keep public-data and user-request cache policies distinct. Use fixed provider host constants, bounded output size, explicit redirects policy, timeouts and graceful no-data handling.

## Air provider and caching

Use server-side Open-Meteo Air Quality, CAMS Global for India. Request only needed hourly variables with UTC timestamps and a bounded forecast horizon. Cache validated public data per city, 15-minute freshness, and permit at most two hours of stale display with time-specific decisions disabled. Do not reuse a snapshot that lacks the interval needed for scoring. Cache fresh misses with short negative TTL if helpful. Coalesce in-flight work within a process. Add bounded platform rate limits for public requests; use edge or shared quotas for any public live upstream calls. Prefer a fresh cache hit without calling upstream. Shared mutable caches never hold household inputs. Explicit demo mode always ships with a known fixture and no network requirement. Data outage has a neutral mode, with opt-in sample mode.

## Gemini design

Model candidate: gemini-3.1-flash-lite on Gemini Developer API. Verify active project eligibility, region, model, quota and terms before enabling. Model must be configurable via GEMINI_MODEL. Use official @google/genai SDK or official HTTPS API; set a real 4-second end-to-end deadline and 256 output-token target. Use structured JSON only and no tools or grounding. Gemini can rank eligible action IDs, select approved rationale IDs paired with those actions, and order morning/afternoon/evening slots among candidate slots. Strictly check shape, membership, uniqueness, rationale pairing, slot validity and required coverage. Re-render with trusted local content and deterministic calculations. Stable rule order has the same cards and priority guardrails. Unknown, duplicate or invalid results cause the entire AI output to be discarded.

Pass only an allowlisted, non-personal scenario abstraction: public episode severity band, broad task category presets, generic candidate and rationale IDs, and eligible generic slot labels. Keep city identifiers, exact schedules, hardware choices, household inputs, cautious preference, raw requests, notes, paths and user identifiers outside Gemini. Generic candidate metadata must contain no personal information. Document prompt version. Apply cautious preference and constraints locally. Never directly render model prose, links or HTML.

## Provider access and abuse controls

Public deployment is a genuine Rules demo with Gemini disabled by default. Optional AI mode is for eligible adult operators only, on loopback or an access-controlled deployment with verified eligible geography and audience; use the host's controls before allowing traffic. A UI toggle or a self-declared age alone does not provide that assurance. Keep the public experience directed to adult planners and use the no-key path for unrestricted judging. If event rules permit, show an actual private operator run or an accurately labeled recording. No saved response may be represented as live. Optionally ship a verified recording for one exact synthetic scenario. Save only the validated output, model ID, capturedAt, prompt version and fixture hash. Revalidate membership and compatibility at replay time, use the same deterministic rendering, and mark it “Recorded Gemini plan.” Never apply a recording to different inputs or generate a stand-in.

Keep GEMINI_API_KEY, provider keys and quota salts server-only. AI mode is disabled with missing configuration and falls back on timeout, provider 429 or quota/backend failure. For hosted live AI, require configured per-minute and per-day atomic shared project caps before every call, plus a bounded per-operator limit. Choose positive caps under observed quota, configure the reset window, and document any failover or cross-instance assumptions. No provider retries from the user path. Public demo must reject forged AI flags. Use same-origin request controls with configured trusted deployment origin, HMAC temporary rate keys based only on trusted platform signals if needed, short TTLs, no raw IP or payload logs. Validate production CSP from actual responses along with frame-ancestors, nosniff and strict referrer behavior. Keep logs to status buckets, latency and failures. Setup should never require a key for npm run dev or CI.

## Environment and repository

Commit .env.example with placeholders for APP_ORIGIN, optional GEMINI_API_KEY, GEMINI_MODEL, AI_MODE, shared limiter configuration and any optional live provider config. Keep all real credentials outside git and build output. Prefer a single npm run check for lint, strict typecheck, unit and integration. Document npm run test:e2e, build and start, provider zero-key demo, and optional adult live smoke steps. Review lockfile and dependency advisories before release.
