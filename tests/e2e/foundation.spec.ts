import { expect, test } from "@playwright/test";
import { checkPage } from "./accessibility";

test.use({ viewport: { width: 320, height: 800 }, reducedMotion: "reduce" });

test("opens the sample from Today and keeps routine edits while switching persona", async ({ page, baseURL }) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    external.push(url.origin);
    return route.abort();
  });

  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const primary = page.getByRole("button", { name: "Build my plan" });
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS("outline-color", "rgb(19, 44, 43)");
  await expect(primary).toHaveCSS("outline-width", "3px");
  await checkPage(page);

  await page.getByRole("link", { name: "Try Delhi demo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Plan your day" })).toBeVisible();
  await expect(page.getByText("Sample scenario", { exact: true })).toBeVisible();
  await expect(page.getByText("15 Jan 2026, 08:00 IST")).toBeVisible();

  const errand = page.getByRole("group", { name: "Errand" });
  await errand.getByLabel("Start time").fill("10:30");
  const household = page.getByRole("radio", { name: "Household" });
  await household.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Community" })).toBeChecked();
  await expect(page.getByLabel("Indoor venue")).toBeVisible();
  await checkPage(page);
  await page.keyboard.press("ArrowLeft");
  await expect(errand.getByLabel("Start time")).toHaveValue("10:30");

  await page.getByRole("link", { name: "Sources" }).click();
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await checkPage(page);
  expect(external).toEqual([]);
});

test("keeps live-unavailable state distinct and recovers from an invalid sample link", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("City", { exact: true }).selectOption("noida");
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page.getByText("Noida", { exact: true })).toBeVisible();
  await expect(page.getByText("Live forecast unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Modeled US AQI", { exact: true })).toHaveCount(0);

  await page.goto("/plan?city=noida&mode=demo");
  await expect(page.getByText(/this city or data mode is unavailable/i)).toBeVisible();
  await page.getByRole("link", { name: "Try Delhi demo" }).click();
  await expect(page.getByText("Sample scenario", { exact: true })).toBeVisible();
});
