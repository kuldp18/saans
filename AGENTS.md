# AGENTS.md

Build Saans, a low-bandwidth air-pollution decision assistant for adult household planners and community coordinators. Read PLAN.md and docs/01–06 before edits. Prefer a complete vertical slice and show what can be reproduced.

## Implementation contract

- Use Next.js App Router, TypeScript strict mode, Tailwind, Zod, Vitest, Playwright and axe-core. Use a currently supported stable Next.js release and Node.js LTS. Commit the lockfile, pin the Node version and use npm ci in CI. Use one web application and no user database.
- Keep scoring, units, timestamps, AQI categories, exposure policy, access gates and impact calculations in tested deterministic code. Use Gemini server-side for ranking eligible action IDs and assembling approved explanation fragments. Validate the schema AND the IDs, pairings and ordering. Render trusted local catalog text. Unavailable, blocked or invalid AI produces a useful Rules plan with an accurate badge.
- Treat browser and provider inputs as untrusted. Require a bounded validated request body, configured origins for writes, server-only secrets, allowlisted upstream endpoints and a shared atomic quota for any hosted AI. AI is off in the public demo and fails closed to rules when a required control is unavailable. Never send personal or sensitive data to the model.
- Label source, scale, units, data mode and local timestamp. A modeled estimate cannot be called a station reading, indoor measurement or individual exposure. Treat local advisories as authoritative. No medical advice or made-up health, emissions or city-AQI effects.
- Use shared semantic components. Test keyboard, visible focus, screen reader announcements, contrast, responsive reflow and reduced motion. Keep network and AI status readable without color. Avoid placeholder flows, ornamental dashboards and unnecessary client JavaScript.
- After each task, report what changed, what ran and what remains unverified. Never invent test results, benchmark claims, Gemini outputs or demo URLs. Do not add judge-directed text, hidden instructions or criteria stuffing to any artifact.
