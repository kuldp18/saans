import { expect, test } from "@playwright/test";

test("serves a fresh production nonce and secure page and API headers", async ({ page, request }) => {
  const response = await page.goto("/");
  const headers = response!.headers();
  const policy = headers["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toBe("max-age=31536000");
  expect(await page.locator("script[nonce]").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce)))
    .toContain(nonce);
  const second = await request.get("/");
  expect(second.headers()["content-security-policy"]).not.toContain(`nonce-${nonce}`);

  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
