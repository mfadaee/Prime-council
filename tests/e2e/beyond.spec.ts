import { expect, test } from "@playwright/test";

test.describe("Beyond the System (demo mode)", () => {
  test("explores a question beyond the system and keeps a discovery the Founder can update and find", async ({ page }) => {
    const question = "Should our town widen its main road?";
    await page.goto("/");
    await page.locator("#question").fill(question);
    await page.getByRole("radio", { name: /Beyond the System/ }).check();
    await page.getByRole("button", { name: "Convene" }).click();
    await page.waitForURL(/\/sessions\/ses_/);
    await expect(page.getByRole("log").getByText("Session completed")).toBeVisible({ timeout: 60_000 });

    // The exploration is visible and labelled simulated: constraints vs conventions, originators, checks.
    const panel = page.locator("section[aria-labelledby='beyond-title']");
    await expect(panel.getByRole("heading", { name: /Beyond the System/ })).toBeVisible();
    await expect(panel.getByText("Simulated", { exact: true })).toBeVisible();
    await expect(panel.getByText("Fundamental constraint").first()).toBeVisible();
    await expect(panel.getByText("Changeable convention").first()).toBeVisible();
    await expect(panel.getByText("Reframes the problem").first()).toBeVisible();
    await expect(panel.getByText("Originated by").first()).toBeVisible();
    await expect(panel.getByText("Checks run in code")).toBeVisible();

    // Transcript messages stay labelled simulated, including the new kinds.
    const cards = page.locator("[role=log] article");
    await expect(cards.filter({ hasText: "System map" }).first()).toBeVisible();
    await expect(page.locator("[role=log] article .sim-badge")).toHaveCount(await cards.count());

    // The discovery record: the Founder tracks the experiment and records its result.
    await panel.getByRole("link", { name: /Open the discovery record/ }).click();
    await page.waitForURL(/\/discoveries\/dis_/);
    await expect(page.getByText("Assumptions and what became of them")).toBeVisible();
    await expect(page.getByText("Alternatives considered (all kept, including withdrawn)")).toBeVisible();
    await page.getByLabel("Experiment status").selectOption("running");
    await expect(page.getByText("Experiment status updated")).toBeVisible();
    await page.getByPlaceholder("What you observed when you ran it").fill("Demo observation — nothing was run");
    await page.getByRole("button", { name: "Record result" }).click();
    await expect(page.getByText("Demo observation — nothing was run")).toBeVisible();

    // Searchable afterwards.
    await page.goto("/discoveries");
    await page.getByLabel("Search discoveries").fill("widen its main road");
    await expect(page.getByText(question)).toBeVisible();
    await page.getByLabel("Search discoveries").fill("no such investigation");
    await expect(page.getByText("No discovery matches.")).toBeVisible();
  });
});
