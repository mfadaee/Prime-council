import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * README media capture, not a regression test.
 *
 * Skipped unless CAPTURE_SCREENSHOTS=1, so normal e2e runs are unaffected.
 * Run by .github/workflows/screenshots.yml, which uploads the PNGs and a GIF as a
 * build artifact. Everything shown is the real app in demo mode, so every
 * contribution on screen carries the "Simulated" label.
 */
const OUT = path.join(__dirname, "..", "..", "test-results", "readme-media");
const enabled = process.env.CAPTURE_SCREENSHOTS === "1";

test.describe("README media (demo mode)", () => {
  test.skip(!enabled, "set CAPTURE_SCREENSHOTS=1 to capture README media");
  test.use({ viewport: { width: 1280, height: 800 }, video: { mode: "on", size: { width: 1280, height: 800 } } });

  test("council session from question to answer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(OUT, "home.png") });

    await page.locator("#question").fill("Should our town library open on Sundays?");
    await page.getByRole("button", { name: "Convene" }).click();
    await page.waitForURL(/\/sessions\/ses_/);
    await expect(page.locator("[role=log] article").first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(OUT, "chamber-live.png") });

    await expect(page.getByRole("log").getByText("Session completed")).toBeVisible({ timeout: 60_000 });
    const final = page.locator("section[aria-labelledby='final-title']");
    await final.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "council-answer.png") });
  });

  test("world map", async ({ page }) => {
    await page.goto("/world");
    await expect(page.getByRole("img", { name: /Map of Ember Hollow/ })).toBeVisible();
    await page.getByRole("button", { name: "+3 days" }).click();
    await expect(page.getByText(/Market day: \d+ trades/).first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "world.png") });
  });
});
