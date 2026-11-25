# Saans verification results

2026-11-25 local audit against [the verification checklist](06-verification.md). Production build ID `4wGKdt0EaZI6K-_N9mqNp`. Lockfile SHA-256 `dbf6ac00a4cf23141684e9652f0ec00699f8c7aecaddf3927036060e1bcecba0`. The workspace has no Git metadata, so a commit ID, staged files, and CI job links could not be verified.

| Environment | Observed configuration |
| --- | --- |
| Host | Windows 10 x64, build 19045, AMD Ryzen 9 5900HX, 16 logical CPUs available to Node, approximately 15 GiB memory reported by Node |
| Toolchain | Node 24.15.0, npm 11.12.1, Next.js 16.4.6, Vite 8.3.8, Vitest 5.0.5, Playwright 1.64.1, axe-core 4.13.0 |
| Browsers | Installed Chrome 158.0.8127.37 for production Playwright, visual inspection, and Lighthouse. Cached Chromium 148 for native browser zoom. |
| Production setup | `next start` on loopback. No provider credentials or operator configuration in the environment. The only project environment file was `.env.example`. |

## Evidence matrix

| Criterion | Command or procedure | Observed result | Evidence and limits |
| --- | --- | --- | --- |
| Code quality | `npm run check` and `npm run build` | ESLint and strict TypeScript passed. Turbopack completed a production build for Today, Planner, Sources, and the three API handlers. | [Architecture](04-architecture.md), [policy tests](../tests/unit/plan-rules.test.ts). The build uses dynamic rendering for nonce CSP. |
| Security | `npm audit --json`, redacted Gitleaks directory scans, local HTTP probes, and production browser header assertions | Final npm audit reported zero known vulnerabilities in its results. Gitleaks found no matches in the audited source snapshot or emitted browser assets. HTTP probes returned `403 origin_denied`, `400 invalid_json`, `400 invalid_plan` for a forged AI flag, `413 body_too_large`, and `415 json_required`. Browser checks verified a fresh CSP nonce, `strict-dynamic`, frame denial, nosniff, referrer policy, and the emitted HSTS header. | [Request tests](../tests/integration/plan-request.test.ts), [access tests](../tests/integration/ai-access.test.ts), [ranking tests](../tests/integration/ai-ranking.test.ts), [browser header checks](../tests/e2e/security.spec.ts). No repository history or hosted HTTPS endpoint available to scan. |
| Efficiency | `node scripts/measure-demo.mjs http://127.0.0.1:3474`, mocked provider/cache tests, and three mobile Lighthouse runs | Demo planner p95 **3.57 ms**. Lighthouse median **100** with **0.758 s** lab LCP. Two overlapping Delhi cache reads shared one mock upstream call. The demo added no upstream calls. | [Measurement script](../scripts/measure-demo.mjs), [air cache tests](../tests/integration/air.test.ts), and timings below. Loopback lab results. |
| Testing | `npm run check`, `npm run test:coverage`, `npm run test:e2e -- --workers=2` | **85 unit/integration tests** and **11 production browser tests** passed. V8 branch coverage was **92.07%** within the configured source scope. | Coverage and case gaps below. Playwright used `PLAYWRIGHT_CHANNEL=chrome` and the existing desktop Chrome executable. |
| Accessibility | Guided keyboard interaction, rendered screenshots and colors, Chrome accessibility tree inspection, native 400% browser zoom, and axe | The skip link, primary button focus, error-summary link, results focus, and evidence disclosure were visible and usable. No horizontal overflow in the checked views. Axe returned zero violations in the scanned states. | [Keyboard and Sources checks](../tests/e2e/foundation.spec.ts), [planner and notice checks](../tests/e2e/planner.spec.ts). Manual assistive-technology speech remains unverified. |
| Problem alignment | Run Today → household comparison and Today → community notice at 320, 390, and 1280 CSS px | The fixed pickup remained scheduled. Sample comparisons were **110 → 50 µg/m³** and **16 → 10 vehicle-km**. The source-stamped notice copied and downloaded without private routine values. | [Golden policy assertions](../tests/unit/plan-rules.test.ts), [browser journeys](../tests/e2e/planner.spec.ts). Delhi is the bundled sample. No independent synthetic fixture exists for each supported city. |

## Latency and cache measurements

The audit server was started with `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3474`. The Node probe used a single sequential caller, 10 warmups and 60 timed requests per endpoint. It timed fetch through JSON parsing, then checked the response's mode or method, fixture values, and `Cache-Control: no-store`. Percentiles use nearest rank.

| Endpoint | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| `GET /api/air?city=delhi&mode=demo` | 60 | 2.38 ms | 3.06 ms |
| `POST /api/plan` with the Delhi Rules fixture | 60 | 2.63 ms | 3.57 ms |

`node node_modules/vitest/vitest.mjs run tests/integration/air.test.ts --reporter=verbose` passed 14 tests. With an injected clock, one upstream response served fresh through 14 min 59.999 s. A read at 15 minutes attempted one refresh. Failure served the previous snapshot during backoff through the two-hour limit and became unavailable 1 ms later. A second city used a separate upstream call. Partial snapshots were displayed once and were excluded from the reusable planning cache. These are mock call counts and boundaries. Production live Open-Meteo and its timing remain unverified.

One real-clock run of the in-process plan handler with a stalled fake Gemini provider returned HTTP 200 and a full Rules plan in **4036.33 ms**. It made one provider call and the transport signal was aborted. The audit ran it with `node node_modules/vitest/vitest.mjs run --config .npm-cache/verification/timeout-audit.config.mts`. This is a local fake-provider sample. `node scripts/gemini-smoke.mjs` skipped the live call because no authorized eligible configuration was supplied.

### Lighthouse

Lighthouse 13.6.0 API attached to isolated headless Chrome via CDP, with traffic against the same loopback route `/plan?city=delhi&mode=demo`. Three successive navigation audits used the performance category and mobile simulated throttling, with 150 ms RTT, 1638.4 Kbit/s simulated throughput, 4× CPU slowdown, and a 412 × 823 screen at 1.75 DPR. Storage reset remained at the Lighthouse default. Raw JSON is local in `.npm-cache/verification/lighthouse-1.json` through `lighthouse-3.json`.

| Run | Performance score | Lab LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 100 | 757.90 ms | 24.50 ms | 0 |
| 2 | 100 | 758.02 ms | 60.49 ms | 0 |
| 3 | 100 | 759.12 ms | 24.50 ms | 0 |
| Median | **100** | **758.02 ms** | **24.50 ms** | **0** |

To reproduce the settings with the CLI, start the local production server and run the following command three times. Use a different output path per run.

```sh
npx --yes lighthouse@13.6.0 "http://127.0.0.1:3474/plan?city=delhi&mode=demo" --only-categories=performance --form-factor=mobile --throttling-method=simulate --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lighthouse-1.json
```

## Accessibility observations

- At 320 CSS px, Tab reached **Skip to content**. Enter focused the main region. Subsequent Tab stops reached the city selector, the official CPCB link, **Build my plan**, and the sample link in order. The rendered primary focus ring was 3 CSS px and dark ink. Playwright now asserts that computed color and width.
- Setting the errand end equal to its start focused **Check your entries**. The accessibility tree exposed a named region with the specific error link. Activating the link moved focus to the invalid end-time input, which referenced the inline message via `aria-describedby`. A valid submission focused **Your plan for Delhi**. Keyboard activation of **See the comparison** revealed both values, times, and the estimate limits.
- Visually reviewed the skip link, primary focus ring, error card, and expanded comparison using local Chrome screenshots. The Sources link opened the local Sources page from the keyboard. CPCB and EPA link labels identified their destinations. External-link uptime was outside this check.
- At 320, 390, and 1280 CSS px, results viewport width equaled document scroll width. A native Chromium tab zoom of 400% yielded a 315 CSS px viewport and 315 CSS px scroll width on both the form and results. A reduced-motion preference was active during the Chrome checks. The comparison disclosure measured 44 CSS px tall. These observations do not constitute a complete target-size audit.
- Sampled rendered color contrasts included main text on canvas **13.76:1**, muted text on white **6.52:1**, advisory text **12.56:1**, evidence text **12.72:1**, error text **8.04:1**, and white primary-button text on teal **8.52:1**. This spot check does not establish WCAG conformance.

## Coverage and remaining release checks

Vitest V8 coverage includes `src/domain/**/*.ts` and `src/server/**/*.ts`. It excludes React components, App Router wrappers, and the proxy. The local JSON summary is `coverage/coverage-summary.json`.

| Module | Branch coverage |
| --- | ---: |
| Selected source overall | 92.07% (523/568) |
| Air normalization and AQI rules | 92.15% |
| Plan impact and policy | 96.87% impact, 94.44% rules |
| Planner form and community notice | 89.18% form, 70.00% notice |
| API request handling | 95.83% request validation, 87.50% plan handler, 100% bounded JSON |
| AI gates and provider | 97.82% access, 92.68% budget, 93.33% Gemini adapter, 87.50% semantic ranking, 90.24% runtime wiring |
| Air service | 100% Open-Meteo adapter, 91.66% cache service, 0% environment wiring in V8 report |

Checklist review found assertions for AQI thresholds, invalid provider data, exact interval edges, missing bins, inactive forecasts, local-date rollover, feasibility, no-purchase fallback, share privacy, quota failure, and zero public demo Gemini calls. The browser suite covers Today, form errors, results, the community notice, and Sources with axe. An exact scenario replay has not been shipped. A live multi-instance budget, a real eligible Gemini request, actual Open-Meteo traffic, the hosted TLS configuration, and NVDA or VoiceOver speech remain unverified. [Operator verification record](gemini-operator.md)

## Advisory and workspace audit

An early registry audit failed inside the default network sandbox. A separately authorized registry check and compatible lockfile update succeeded. Next.js was updated from 16.4.3 to 16.4.6, Vite from 8.3.5 to 8.3.8, and npm’s compatible transitive fixes removed the remaining nine advisory findings, including high-severity Browserslist entries. A fresh `npm ci --no-audit` installed 401 packages and warned that ESLint 9.39.5 is deprecated. The currently locked Next.js lint preset still imports an ESLint-9-compatible plugin. The final separate `npm audit --json` reported 0 low, 0 moderate, 0 high, and 0 critical findings. [Next.js security release](https://nextjs.org/blog/november-2026-security-release) · [Vite security advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7)

`git status --short` and `git rev-parse --is-inside-work-tree` both returned `fatal: not a git repository (or any of the parent directories): .git`. No staging or commit was performed. Gitleaks 8.30.1 ran with `dir --redact=100 --no-banner` against a workspace source snapshot and separately against `.next/static`. The source scope included hidden configuration such as `.env.example` and excluded dependency, build, coverage, cache, and test output directories plus generated Next.js and TypeScript files. The browser bundle search found no Gemini endpoint or named server secret configuration in the emitted JavaScript. This audit does not establish the state of any external Git history or unpublished environment files.

## Release rehearsal

2026-11-25 production build `D2dLODT-0HfFXzlESFI7E`, with the same dependency lockfile as the audit above. `npm run check` passed all 85 tests. `npm run build` passed. `PLAYWRIGHT_CHANNEL=chrome` with `npm run test:e2e -- --workers=2` passed all 12 browser tests. The earlier performance figures refer to the audit build above.

Two separately launched Chrome 158 browser instances started without cookies at 390 × 844 CSS px with mobile and touch emulation. The household instance opened the README’s direct Delhi link on a local production server at `127.0.0.1:3000`. The community instance started from Today and opened the demo through navigation. Both displayed **Sample scenario** and **Rules plan**, stayed within the viewport, and made zero external browser requests. The household impact labels and the community notice’s sample timestamp and CPCB link were verified. Playwright separately verified notice copy and download.

The production browser suite verified **Model estimate**, **Stale model estimate**, and **AI-ranked plan** using intercepted responses. The fake provider integration test reordered an eligible errand card ahead of the retained school pickup while preserving advisory priority and calculations. The authorized Gemini smoke command skipped. An actual Gemini recording and exact-fixture replay remain unavailable. [Browser badge checks](../tests/e2e/planner.spec.ts) · [Ranking integration test](../tests/integration/ai-ranking.test.ts)

The workspace contained the six evaluation criteria and an internal release prompt. It had no public deployment URL, event identifier, or official submission form. Required form fields, deadlines, accepted artifacts, and whether a private AI recording is permitted remain unverified. The README marks the URL pending. The shared deployment and official form are required to complete hosted validation and submission review. No submission was made.

## Live air verification

On 2026-11-25, a production server on loopback with local live-air settings returned both Open-Meteo US AQI and CPCB India AQI for Delhi, Noida, Gurugram, Lucknow, Ahmedabad, and Kolkata. The Delhi response showed **176 modeled US AQI**, valid 25 Nov at 11:30 IST, and **227 India AQI** from the 24 Nov 16:00 IST CPCB city bulletin. A real `POST /api/plan` returned both sources with a Rules plan. A 390 px Chrome viewport displayed the two sources without horizontal overflow. Gemini and hosted quota were outside this live check. [CPCB bulletin used in the check](https://cpcb.gov.in/upload/Downloads/AQI_Bulletin_20261124.pdf) · [Open-Meteo API](https://open-meteo.com/en/docs/air-quality-api)

## Worldwide city search

On 2026-11-25, `npm run check` passed lint, type checking, and 96 unit and integration tests. `npm run build` passed. With `PLAYWRIGHT_CHANNEL=chrome`, `npm run test:e2e -- --workers=2` passed 14 production browser tests. The keyless test run covered keyboard selection between the French and Texan cities named Paris at 320 px, and browser geolocation preselecting Lucknow. Integration tests covered the city cache, time zones and ID validation. [Geocoding integration tests](../tests/integration/geocoding.test.ts) · [Browser cases](../tests/e2e/foundation.spec.ts)

A separate live smoke used a production server on loopback and public provider endpoints. `GET /api/air?city=geo-2643743` resolved a direct London link without a preceding search. `GET /api/locations?q=…` followed by `GET /api/air?city=…` returned live modeled forecasts in the expected time zones for Paris, Kathmandu and Mumbai. The Mumbai response also included CPCB India AQI 115. A separate 390 px Chrome session selected Paris from Today and submitted `POST /api/plan` successfully. It displayed modeled US AQI, Europe/Paris times and a Rules plan without horizontal overflow. Worldwide coverage is provider-dependent. Automatic browser preselection covered the six built-in Indian cities. Hosted provider access and hosted AI remain unverified.
