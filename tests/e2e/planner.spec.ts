import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { delhiGoldenInput } from "../../src/catalog/delhi-golden";
import { airSnapshotSchema } from "../../src/domain/air";
import { presentAir } from "../../src/domain/air-presentation";
import { buildRulesPlan } from "../../src/domain/plan/rules";
import { checkPage } from "./accessibility";

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Try Delhi demo" }).click();
  await expect(page.getByRole("heading", { name: "Plan your day" })).toBeVisible();
}

for (const width of [320, 390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: "reduce" });

    test("Today to household impact comparison", async ({ page }) => {
      await openSample(page);
      const errand = page.getByRole("group", { name: "Errand", exact: true });
      const end = errand.getByLabel("End time");
      await end.fill("08:30");
      await page.getByRole("button", { name: "Generate plan" }).click();
      const errors = page.getByRole("region", { name: "Check your entries" });
      const errorLink = errors.getByRole("link", { name: /allow 30 to 120 minutes/ });
      await expect(errors).toBeFocused();
      await expect(end).toHaveAttribute("aria-invalid", "true");
      await errorLink.click();
      await expect(end).toBeFocused();
      await checkPage(page);

      await end.fill("09:30");
      await page.getByRole("button", { name: "Generate plan" }).click();
      const result = page.getByRole("heading", { name: "Your plan for Delhi" });
      await expect(result).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: "Plan ready." })).toHaveCount(1);
      await expect(page.getByText("Rules plan", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Keep school pickup as scheduled" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /particle filter/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Skip incense and candles" })).toBeVisible();
      await expect(page.getByText("6 vehicle-km avoided", { exact: true })).toBeVisible();
      const routine = page.getByRole("region", { name: "Today’s routine" });
      await routine.getByText("See the comparison", { exact: true }).click();
      await expect(routine.getByText("110 µg/m³", { exact: true })).toBeVisible();
      await expect(routine.getByText("50 µg/m³", { exact: true })).toBeVisible();
      await expect(routine.getByText(/13:30–14:30 IST/).first()).toBeVisible();
      await expect(routine.getByText(/personal exposure/).last()).toBeVisible();
      await checkPage(page);
    });

    test("Today to source-stamped community notice", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openSample(page);
      await page.getByRole("radio", { name: "Community" }).check();
      await page.getByLabel("Current private-car distance (km)").fill("37.4");
      await page.getByLabel("Proposed private-car distance (km)").fill("15.2");
      await page.getByRole("button", { name: "Generate plan" }).click();
      await expect(page.getByRole("heading", { name: "Your plan for Delhi" })).toBeFocused();
      await expect(page.getByRole("heading", { name: "Move the activity indoors" })).toBeVisible();
      const region = page.getByRole("region", { name: "Community notice" });
      const preview = region.getByRole("textbox", { name: "Notice text" });
      await expect(preview).toHaveValue(/Sample scenario · Saans synthetic fixture/);
      const notice = await preview.inputValue();
      expect(notice).toContain("Delhi · Community air notice");
      expect(notice).toContain("Data valid 15 Jan 2026, 08:00 IST");
      expect(notice).toContain("https://app.cpcbccr.com/AQIIndia");
      expect(notice).toContain("Move the optional outdoor activity indoors");
      expect(notice).toContain("Coordinate one combined supply trip");
      expect(notice).not.toMatch(/37\.4|15\.2|08:30|school pickup|car-1/i);

      const copy = region.getByRole("button", { name: "Copy notice" });
      await copy.click();
      await expect(copy).toBeFocused();
      await expect(region.getByRole("status")).toHaveText("Notice copied.");
      const pasted = await page.evaluate(() => navigator.clipboard.readText());
      expect(pasted.replaceAll("\r\n", "\n")).toBe(notice);

      const download = page.waitForEvent("download");
      await region.getByRole("link", { name: "Download text" }).click();
      const artifact = await download;
      expect(artifact.suggestedFilename()).toBe("saans-community-notice.txt");
      expect(await readFile(await artifact.path(), "utf8")).toBe(notice);
      await checkPage(page);
    });
  });
}

test("preserves edits after result and selects the notice if clipboard access is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { get: () => ({
      writeText: () => Promise.reject(new DOMException("Blocked", "NotAllowedError")),
    }) });
  });
  await openSample(page);
  await page.getByRole("radio", { name: "Community" }).check();
  const end = page.getByRole("group", { name: "Outdoor group activity", exact: true }).getByLabel("End time");
  await end.fill("09:00");
  await page.getByRole("button", { name: "Generate plan" }).click();
  const region = page.getByRole("region", { name: "Community notice" });
  await region.getByRole("button", { name: "Copy notice" }).click();
  const preview = region.getByRole("textbox", { name: "Notice text" });
  await expect(preview).toBeFocused();
  await expect(region.getByRole("status")).toHaveText(/selected for manual copying/);
  expect(await preview.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart))
    .toBe((await preview.inputValue()).length);
  await page.getByRole("button", { name: "Edit routine" }).click();
  await expect(page.getByRole("heading", { name: "Plan your day" })).toBeFocused();
  await expect(end).toHaveValue("09:00");
});

test("shows stale forecast provenance without suggesting a time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const now = Date.parse("2026-01-15T02:45:00Z");
  const snapshot = airSnapshotSchema.parse({
    cityId: "delhi", timeZone: "Asia/Kolkata", sourceId: "OPEN-METEO-AIR", mode: "stale-model",
    fetchedAt: "2026-01-15T02:15:00Z",
    hourly: [{ validAt: "2026-01-15T02:00:00Z", pm25UgM3: 120, usAqi: 220 }],
  });
  const profile = { ...delhiGoldenInput, activities: delhiGoldenInput.activities.filter(({ activityId }) => activityId === "errand"), travel: undefined };
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({ json: { plan: buildRulesPlan(profile, snapshot, now), air: presentAir(snapshot, now) } });
  });
  await openLiveErrand(page);
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByText("Stale model estimate", { exact: true })).toBeVisible();
  await expect(page.getByText("Rules plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Model estimate", { exact: true })).toHaveCount(0);
  await expect(page.getByText("15 Jan 2026, 07:30 IST")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep errand as scheduled" })).toBeVisible();
  await expect(page.getByText("See the comparison", { exact: true })).toHaveCount(0);
  await checkPage(page);
});

async function openLiveErrand(page: Page) {
  await page.goto("/");
  await page.getByLabel("City", { exact: true }).selectOption("delhi");
  await page.getByRole("button", { name: "Build my plan" }).click();
  await page.getByLabel("Planning date").fill("2026-01-15");
  await page.getByLabel("Include school pickup").uncheck();
  const errand = page.getByRole("group", { name: "Errand", exact: true });
  await errand.getByLabel("Start time").fill("08:30");
  await errand.getByLabel("End time").fill("09:30");
  await errand.getByLabel("Earliest feasible start").fill("08:00");
  await errand.getByLabel("Latest feasible finish").fill("14:30");
}

test("distinguishes modeled data from sample data and AI ranking from rules", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const now = Date.parse("2026-01-15T02:45:00Z");
  const snapshot = airSnapshotSchema.parse({
    cityId: "delhi", timeZone: "Asia/Kolkata", sourceId: "OPEN-METEO-AIR", mode: "live-model",
    fetchedAt: new Date(now).toISOString(),
    hourly: [{ validAt: "2026-01-15T02:00:00Z", pm25UgM3: 120, usAqi: 220 }],
  });
  const rules = buildRulesPlan(delhiGoldenInput, snapshot, now);
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({ json: { plan: { ...rules, method: "ai-ranked" }, air: presentAir(snapshot, now) } });
  });
  await openLiveErrand(page);
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByText("AI-ranked plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Model estimate", { exact: true })).toBeVisible();
  await expect(page.getByText("Modeled US AQI", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open-Meteo · CAMS Global" })).toBeVisible();
  for (const label of ["Sample scenario", "Stale model estimate", "Rules plan"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await checkPage(page);
});
