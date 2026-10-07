import { expect, test } from "@playwright/test";

test("mobile: chamber, controls and final answer fit without horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#question")).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("#mobile-nav").getByRole("link", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();

  await page.locator("#question").fill("How can a neighbourhood reduce food waste?");
  await page.getByRole("button", { name: "Convene" }).click();
  await page.waitForURL(/\/sessions\//);
  await expect(page.getByRole("log").getByText("Session completed")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#final-title")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "■ Stop" })).toBeVisible();
});
