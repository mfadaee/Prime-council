import { test, expect, type Page } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

/**
 * The GitHub Pages demo (`index.html`) is the first thing most visitors see, and it
 * is a static page that the Next build does not compile. These tests serve the repo
 * root as GitHub Pages would and check the paths a visitor arriving from a shared
 * link takes: one tap to a finished session, `?q=` share links, Markdown export and
 * the "run it for real" card. Requests to other hosts (web fonts) are aborted.
 */

const root = path.resolve(__dirname, "..", "..");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".js": "text/javascript",
  ".css": "text/css",
};

let server: http.Server;
let base = "";

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://pages.local");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(`${base}/index.html${query}`);
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
}

test("one tap runs a labelled, simulated session to completion", async ({ page }) => {
  const errors = await open(page);
  const cta = page.locator("#ctaBtn");
  await expect(cta).toBeVisible();
  await expect(cta).toBeInViewport();
  await cta.click();
  await expect(cta).toBeHidden();

  await expect(page.locator("#phasePill")).toContainText("Session complete", { timeout: 60_000 });
  await expect(page.locator("#outcome")).toContainText("Final answer (Synthesizer)");
  await expect(page.getByText(/simulated/i).first()).toBeVisible();

  const card = page.locator(".nextstep");
  await expect(card).toContainText("That council was simulated");
  await expect(card.locator("code")).toContainText("docker compose up --build");

  await page.reload();
  await expect(page.locator("#ctaBtn")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a ?q= share link convenes once, escapes markup and exports Markdown", async ({ page }) => {
  const question = '<b>ban</b> tools & "yes"?';
  const errors = await open(page, `?q=${encodeURIComponent(question)}`);

  await expect(page.locator("#askBox")).toHaveValue(question);
  await expect(page.locator("#phasePill")).toContainText("Session complete", { timeout: 60_000 });
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
  await expect(page.locator("#transcript b", { hasText: "ban" })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await page.locator('[data-export="download"]').click();
  const file = await (await download).path();
  const md = fs.readFileSync(file, "utf8");
  expect(md).toMatch(/simulated/i);
  expect(md).toContain("&lt;b&gt;ban&lt;/b&gt;");
  expect(md).not.toContain("<b>ban</b>");
  expect(md).toContain("?q=");

  await page.reload();
  await expect(page.locator("#phasePill")).toContainText("Session complete");
  expect(errors).toEqual([]);
});

test("phone width: first action is on screen and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await expect(page.locator("#ctaBtn")).toBeInViewport();
  for (const tab of ["#h-council", "#h-sessions", "#h-world", "#h-primes"]) {
    await expect(page.locator(tab).first()).toBeAttached();
  }
  await noHorizontalOverflow(page);

  await page.locator("#ctaBtn").click();
  await expect(page.locator("#phasePill")).toContainText("Session complete", { timeout: 60_000 });
  await expect(page.locator(".nextstep")).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
