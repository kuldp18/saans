import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3417";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  } }],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3417",
    url: origin,
    env: { NEXT_TELEMETRY_DISABLED: "1", APP_ORIGIN: origin, AIR_LIVE_ENABLED: "0", AI_MODE: "off" },
  },
});
