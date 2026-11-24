# Saans implementation plan

## Architecture

One Next.js app serves the screens and same-origin endpoints. A city catalog maps city IDs to public centroids. An Open-Meteo adapter normalizes its forecast for the rule engine. The engine selects eligible actions and computes comparisons. An optional Gemini adapter ranks already-valid bundles. A fallback ranker and banked snapshot guarantee the same demo journey without credentials.

## Build in this order

| Stage | Prompt | Exit gate |
| --- | --- | --- |
| Audit | 00-kickoff | Trace all six judging factors to app behavior and verification. Record assumptions and the provider access mode. |
| Foundation | 01-foundation | npm ci and npm run check work. Navigation, form and synthetic forecast shell work at phone width. |
| Domain and air data | 02-air-and-impact | Demo snapshot and provider adapter use the same canonical schema. Boundary tests and golden arithmetic pass. Missing data is safe. |
| Core experience | 03-experience | Household and community workflows work from input to plan, impact and share. No fixture is confused with live data. |
| AI and controls | 04-gemini-security | A fake provider proves valid AI output visibly changes order. Invalid output, timeout and budget failure fall back. An eligible operator can run a real smoke test. |
| Evaluation | 05-quality | Full verification suite runs on a production build with no credentials. Measure performance and document manual accessibility checks. |
| Release | 06-release | Public demo works in a fresh session. Repository explains setup, architecture, source provenance, tradeoffs and actual check results. |

## Time allocation

For a 24-hour hackathon, budget 3h for foundation, 5h for data and rules, 6h for UI, 4h for Gemini and controls, 4h for verification, and reserve 2h for deployment and submission. Deploy the credential-free demo once the core flow exists.

## Scope if time is tight

Protect the household and community pathways, the evidence behind each card, the no-key route, and one real Gemini demonstration where permitted. Drop decorative charts or enhancements before cutting source provenance, fallback behavior, tests or accessible navigation.

## Target runtime repository

    src/app/                       routes and route handlers
    src/components/                semantic UI components
    src/domain/air/                normalized forecasts and AQI
    src/domain/plan/               eligibility, fallback and comparison
    src/catalog/                   cities, actions, source IDs and fixtures
    src/server/air/                Open-Meteo adapter and cache
    src/server/ai/                 Gemini adapter, gate and output validation
    src/server/http/               request guards and quota interface
    tests/unit/                    domain and validation
    tests/integration/             endpoints and provider contracts
    tests/e2e/                     user flows and axe checks
    scripts/                       reproducible smoke and measurement tools
    .github/workflows/             CI

## Release packet

Submit the repository and live demo link in README, a concise limitations section, evidence mapped to the six criteria, and any recording or forms required by the actual event. Show proof of meaningful AI behavior only when a real request has successfully run and the deployment or recording context permits it.
