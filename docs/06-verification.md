# Verification and evidence

Use fixtures and mocked providers in CI. Make the official public demo runnable after npm ci and npm run dev, with no secrets and no network calls on the sample path. Verification claims need observed outputs and a linked test file. The table below is a release gate, not a recorded test result.

| Criterion | Acceptance | Evidence to link |
| --- | --- | --- |
| Code quality | Typed contracts, small pure rules, no duplicated AQ logic, readable project layout, meaningful named functions | Typecheck and lint output, architecture diagram, representative tests |
| Security | Strict request validation, outbound host controls, private secrets, budget gate, safe AI schema and IDs, request privacy | Route integration tests, official deployment headers, git secret scan and dependency audit |
| Efficiency | One Gemini call at most per eligible request, zero demo calls, no polling, cache and dedupe, bounded deadlines | Fake-provider call counts, production traces and a reproducible mobile run |
| Testing | Deterministic unit, integration and Playwright end-to-end tests | CI job links, assertions and per-module branch coverage |
| Accessibility | WCAG 2.2 AA target, keyboard and focus support, non-color status, readable mobile form | axe results on each state, manual keyboard and screen-reader log, rendered contrast and reflow checks |
| Problem alignment | Household and community flows, city tailoring, actionable indoor/lower-emission alternatives and explainable impact | Golden journeys, screenshots and one optional private Gemini run |

## Required cases

- **Domain:** Test exact AQI boundaries at 0, 50/51, 100/101, 150/151, 200/201, 300/301. Missing, malformed and negative provider fields have no categories. Verify 110→50 and 16→10 from the golden fixture. Test weighted half-hours, zero baseline, negative change, missing hours, irrelevant timestamps, local date rollover, exact boundary bins and fixed tasks.
- **Behavior:** Test severe optional outdoor suppression, no-purchase household without a purifier, inaccessible transport, no indoor venue, incompatible options, distinct city fixtures and no positive alternative. Verify the share notice includes city, source, timestamp and mode, with no raw inputs.
- **Integration:** Test 400/413/415 handling, same-origin rejection, unknown city and hostile IDs, explicit data-mode transitions, TTL and coalescing, rate-gate failure, over-budget denial and a request that exceeds the deadline. Verify that malformed Gemini JSON, ID hallucinations, mismatched rationale IDs and repeated IDs fall back. Assert no Gemini call in public demo even with a forged parameter. Valid mocked Gemini output must visibly alter a valid order without changing factual text, metrics or priority warning. If replay ships, test matching fixture replay, corruption and mismatch handling, labeling and zero Gemini calls.
- **End-to-end:** Phone-width household demo and community copy/download; edit results and compare; no-key demo in an offline/mock context; stale and missing data paths; keyboard-only flow; axe on Today, Planner with errors, Results, Community notice and Sources. Verify the served production build, not only dev mode.

## Targets and commands

- npm run check: ESLint, strict typecheck, unit and integration. Aim for at least 90% branch coverage in deterministic scoring and policy and 85% in API/AI guard modules. Coverage is a signal, not a substitute for the above cases.
- npm run test:e2e: Playwright on the production build. Upload traces only on failure; never include secrets or real user payloads.
- npm run build: production build. Record Lighthouse median over three mobile runs on the same public no-key route with version and throttle settings. Aim for a performance score ≥90 and lab LCP ≤2.5 s. Do not label lab metrics as field results. Measure API p50/p95 separately for deterministic fixture and real provider when available. Record configuration and sample count; aim <300 ms p95 for local warm fixture work and return a usable fallback by five seconds for slow AI on a warm request.
- Accessibility: measure actual color pairs against WCAG AA, test 320px and 400% reflow, focus not obscured, minimum 44px design targets, status announcement and reduced motion. Screen reader smoke with NVDA or VoiceOver. Mark unavailable manual checks accurately.

## Evidence template

Create docs/verification-results.md during implementation. For each criterion record build/commit, command or manual procedure, observed result, linked test or artifact, and any unverified assumptions. A provider fail or skip is a recorded result. Keep README public demo instructions runnable without keys. No screenshots of fake measurements or badges claiming a perfect score.
