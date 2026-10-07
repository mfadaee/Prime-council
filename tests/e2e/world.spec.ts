import { expect, test } from "@playwright/test";

const H = { "x-simlife-request": "1" };

test("world: step, council decision, snapshot and restore", async ({ page, request }) => {
  // Make every project go to the council so the decision path is exercised quickly.
  const w = await (await request.get("/api/world")).json();
  await request.post("/api/world", { headers: H, data: { action: "config", config: { ...w.state.config, councilThresholdCredits: 10 } } });

  await page.goto("/world");
  await expect(page.getByText("Simulation", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Map of Ember Hollow/ })).toBeVisible();

  await page.getByRole("button", { name: "+3 days" }).click();
  await expect(page.getByText(/Market day: \d+ trades/).first()).toBeVisible();

  // Advance until a proposal reaches the council docket.
  const docket = page.locator("section[aria-labelledby='docket-title'] li");
  for (let i = 0; i < 6 && (await docket.count()) === 0; i++) await page.getByRole("button", { name: "+3 days" }).click();
  await expect(docket.first()).toBeVisible();

  // Snapshot before deciding.
  page.once("dialog", (d) => d.accept("before decision"));
  await page.getByRole("button", { name: "◫ Snapshot" }).click();
  await expect(page.getByText("Snapshot saved")).toBeVisible();

  // Ask the (demo) council, then decide as Prime.
  await docket.first().getByRole("button", { name: "Ask the Primes" }).click();
  await expect(docket.first().getByRole("link", { name: "Council session" })).toBeVisible();
  await expect(page.getByText(/The Founder asks the Primes to deliberate/)).toBeVisible();
  const name = (await docket.first().locator("p").first().textContent())!.trim();
  await docket.first().getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(`The Founder approves ${name}.`)).toBeVisible();

  // Select an inhabitant from the map.
  await page.getByRole("button", { name: /^Ada, farmer/ }).click();
  await expect(page.getByRole("dialog")).toContainText("An agent created by");
  await page.keyboard.press("Escape");

  // Restore the snapshot: the project is back on the docket, on a new branch.
  page.once("dialog", (d) => d.accept());
  const restore = page.getByRole("combobox").filter({ hasText: "Restore snapshot…" });
  const value = await restore.locator("option", { hasText: "before decision" }).getAttribute("value");
  await restore.selectOption(value!);
  await expect(page.getByText(/restored snapshot “before decision”/)).toBeVisible();
  await expect(page.getByText(/branch 1/).first()).toBeVisible();
  await expect(docket.filter({ hasText: name })).toBeVisible();
});
