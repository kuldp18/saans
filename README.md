# Saans

Saans helps household planners and community coordinators in urban India decide what to keep, move, or combine on high-pollution days. It explains each suggestion using air data, routine constraints, and sourced guidance.

**Public demo URL — pending.** The production build has been verified on loopback. See the [verification results](docs/verification-results.md).

## Run the no-key demo

Use Node **24.15.0**, pinned in [`.nvmrc`](.nvmrc). No environment file or API key is needed for the Delhi sample.

```sh
npm ci
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Open [Today](http://127.0.0.1:3000/) and choose **Try Delhi demo**, or open the [Delhi scenario](http://127.0.0.1:3000/plan?city=delhi&mode=demo) directly. Start from that link in a fresh tab to replay the original routine. The dated **Sample scenario** always produces a **Rules plan** with zero upstream requests.

### Household

1. Leave **Household** selected and choose **Generate plan**. The school pickup stays fixed.
2. Open **See the comparison** on the errand card. Moving the errand from 08:30–09:30 to 13:30–14:30 IST lowers the synthetic modeled outdoor PM₂.₅ average from **110 to 50 µg/m³**.
3. Check the no-purchase indoor action and the confirmed combined trip, which saves **6 private-car vehicle-km**. Use **Edit routine** to change a constraint and generate again.

### Community

1. Open the Delhi sample, choose **Community**, leave the indoor venue available, and select **Generate plan**.
2. Check the indoor activity adjustment and combined supply trip. Under **Community notice**, choose **Copy notice** or **Download text**. The notice carries the city, sample label, valid local time, and CPCB guidance link.

## Architecture and sources

One Next.js App Router application validates routines and routes them to a deterministic rules engine. The engine filters for feasibility, preserves fixed times, and calculates same-duration PM₂.₅ comparisons and private-car distance. The server reads either the versioned Delhi fixture or a normalized city forecast. The optional Gemini adapter can rank eligible cards and select approved reasons. Rules retain authority over advice eligibility, numbers, and sources. [Architecture](docs/04-architecture.md) · [Open-Meteo and CAMS Global](https://open-meteo.com/en/docs/air-quality-api) · [CPCB national AQI](https://app.cpcbccr.com/AQIIndia) · [AirNow and EPA source register](docs/05-sources.md)

## Limits and release status

- The Delhi fixture is synthetic. **Model estimate** identifies modeled US AQI and outdoor PM₂.₅. **Stale model estimate** identifies a cached forecast and disables time-specific suggestions. India’s official CPCB readings use a separate AQI scale. Follow local guidance.
- A city model describes outdoor grid conditions. It cannot measure individual exposure or indoor air. The travel comparison measures private-car distance. Saans gives no medical guidance or quantified health, emissions, or city-AQI benefit.
- The public release configuration is **`AI_MODE=off`**. Hosted AI requires independently verified adult and regional access and a shared atomic budget. Real Gemini and hosted quota calls were skipped, so the repository ships no Gemini recording. Production Open-Meteo calls are disabled pending shared upstream controls. [Operator setup and verification](docs/gemini-operator.md)
- A public host URL and the official event form are pending. A hosted instance needs `APP_ORIGIN` set to its exact HTTPS origin.

## Verify locally

From the repository root, after installing dependencies and building as above, run:

```sh
npm run check
npm run test:coverage
npx --no-install playwright install chromium
npm run test:e2e
```

[Evidence matrix and measured results](docs/verification-results.md) · [Golden policy tests](tests/unit/plan-rules.test.ts) · [Provider and cache tests](tests/integration/air.test.ts) · [Mocked AI ranking and fallback](tests/integration/ai-ranking.test.ts) · [Browser walkthroughs](tests/e2e/planner.spec.ts) · [Production security headers](tests/e2e/security.spec.ts)
