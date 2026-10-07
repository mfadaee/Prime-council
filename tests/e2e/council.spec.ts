import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const H = { "x-simlife-request": "1" };

async function ask(page: Page, question: string) {
  await page.goto("/");
  await page.locator("#question").fill(question);
  await page.getByRole("button", { name: "Convene" }).click();
  await page.waitForURL(/\/sessions\/ses_/);
}

async function setMemberProvider(request: APIRequestContext, memberId: string, providerId: string, model: string) {
  const r = await request.patch(`/api/members/${memberId}`, { headers: H, data: { providerId, model } });
  expect(r.ok()).toBeTruthy();
}

test.describe("council chamber (demo mode)", () => {
  test("streams a labelled simulated session from convening to final answer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();
    await expect(page.getByText("SIMULATED · demo provider")).toBeVisible();
    await ask(page, "Should a small library open on Sundays?");

    // Live states appear while members wait on the (simulated) provider.
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.locator("button[aria-label*='Preparing'], button[aria-label*='Reviewing']").first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("log").getByText("Session completed")).toBeVisible({ timeout: 45_000 });
    const final = page.locator("section[aria-labelledby='final-title']");
    await expect(final.getByRole("heading", { name: "Council answer" })).toBeVisible();
    await expect(final.getByText("Simulated", { exact: true })).toBeVisible();
    await expect(final).toContainText("no model was called");

    // Every transcript contribution is labelled simulated.
    const cards = page.locator("[role=log] article");
    const n = await cards.count();
    expect(n).toBeGreaterThan(5);
    await expect(page.locator("[role=log] article .sim-badge")).toHaveCount(n);

    // Compare initial vs final.
    await final.getByRole("button", { name: "Compare initial vs final" }).click();
    await expect(final.getByText("Initial answer (before critique)")).toBeVisible();

    // Expandable published details.
    await cards.first().getByText("Published details").click();
    await expect(cards.first().getByText("Success criteria")).toBeVisible();
  });

  test("replays a finished session on the timeline", async ({ page, request }) => {
    const { sessions } = await (await request.get("/api/sessions")).json();
    const done = sessions.find((s: { status: string }) => s.status === "completed");
    test.skip(!done, "needs a completed session from the previous test");
    await page.goto(`/sessions/${done.id}`);
    await expect(page.getByRole("log").getByText("Session completed")).toBeVisible();
    const slider = page.getByRole("slider", { name: "Replay position" });
    await slider.focus();
    await slider.press("Home");
    await expect(page.getByText(/\(replay\)/)).toBeVisible();
    await expect(page.getByText("No activity yet.")).toBeVisible();
    for (let i = 0; i < 12; i++) await slider.press("ArrowRight");
    await expect(page.locator("[role=log] article").first()).toBeVisible();
    await page.getByRole("button", { name: /Latest/ }).click();
    await expect(page.getByText(/Event (\d+) of \1$/)).toBeVisible();
  });

  test("the Prime can stop deliberation", async ({ page }) => {
    await ask(page, "Plan a city-wide recycling programme");
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "■ Stop" }).click();
    await expect(page.getByRole("log").getByText("Session stopped: Stopped by the Prime")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("The Prime stopped deliberation")).toBeVisible();
    await expect(page.locator("section[aria-labelledby='final-title']")).toContainText("No final answer");
  });

  test("an unreachable provider is shown as offline and the council continues", async ({ page, request }) => {
    const created = await request.post("/api/providers", {
      headers: H,
      data: { id: "dead-endpoint", kind: "openai_compatible", label: "Unreachable test server", baseUrl: "http://127.0.0.1:9/v1", local: true },
    });
    expect(created.status()).toBe(201);
    await setMemberProvider(request, "vex", "dead-endpoint", "test-model");
    try {
      await ask(page, "What is the best way to learn a language as an adult?");
      await expect(page.getByRole("log").getByText("Session completed")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("[role=log]")).toContainText(/Vex: unavailable — Could not reach provider/);
      await expect(page.getByRole("button", { name: /^Vex, Skeptic\. Offline/ })).toBeVisible();
      // Mixed session: not every member is simulated, so the chamber is not labelled all-simulated…
      await expect(page.getByText("SIMULATED · demo provider")).toHaveCount(0);
      // …but demo members' messages still are.
      await expect(page.locator("[role=log] article .sim-badge").first()).toBeVisible();
    } finally {
      await setMemberProvider(request, "vex", "demo", "demo-simulated");
      await request.delete("/api/providers/dead-endpoint", { headers: H });
    }
  });

  test("addressing a member directly gets a reply in the transcript", async ({ page, request }) => {
    const { sessions } = await (await request.get("/api/sessions")).json();
    const done = sessions.find((s: { status: string }) => s.status === "completed");
    await page.goto(`/sessions/${done.id}`);
    await page.getByRole("button", { name: "✉ Address a member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").selectOption("lumen");
    await dialog.getByPlaceholder("Your message").fill("Which claim most needs a source?");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("[role=log]")).toContainText('The Prime to Lumen: "Which claim most needs a source?"');
    await expect(page.locator("[role=log] article").last()).toContainText("Direct reply", { timeout: 15_000 });
  });

  test("seats are keyboard accessible and open member details", async ({ page }) => {
    await page.goto("/");
    const seat = page.getByRole("button", { name: /^Quill, Analyst/ });
    await seat.focus();
    await expect(seat).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(seat).toHaveAttribute("aria-pressed", "true");
  });

  test("respects reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("http://localhost:3210/");
    await expect(page.locator("#question")).toBeVisible();
    const duration = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "spin-slow";
      document.body.appendChild(el);
      return getComputedStyle(el).animationDuration;
    });
    expect(parseFloat(duration)).toBeLessThan(0.01);
    await ctx.close();
  });
});

test.describe("security", () => {
  test("writes without the CSRF header are rejected", async ({ request }) => {
    const r = await request.post("/api/sessions", { data: { question: "hello there" } });
    expect(r.status()).toBe(403);
  });

  test("non-loopback Host headers are refused when no access token is set", async ({ request }) => {
    const r = await request.get("/api/status", { headers: { host: "evil.example.com" } });
    expect(r.status()).toBe(403);
  });

  test("API never returns key values", async ({ request }) => {
    const body = await (await request.get("/api/providers")).text();
    expect(body).not.toMatch(/sk-|AIza/);
    expect(body).toContain("keyPresent");
  });

  test("input validation rejects oversized questions", async ({ request }) => {
    const r = await request.post("/api/sessions", { headers: H, data: { question: "x".repeat(5000) } });
    expect(r.status()).toBe(400);
  });
});
