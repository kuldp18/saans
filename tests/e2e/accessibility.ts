import { expect, type Page } from "@playwright/test";
import axe from "axe-core";

export async function checkPage(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const a11y = (window as Window & { axe?: typeof axe }).axe;
    if (!a11y) throw new Error("axe-core was not loaded");
    const result = await a11y.run();
    return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target }) => target) }));
  });
  expect(violations).toEqual([]);
}
