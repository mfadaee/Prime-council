import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * End-to-end tests run against a production build (`npm run build` first) with a
 * fresh embedded database. Set PW_CHROMIUM_PATH to use a preinstalled Chromium.
 */
const PORT = 3210;
const dataDir = path.join(__dirname, ".data", `e2e-${Date.now()}`);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PGLITE_DIR: dataDir, NODE_ENV: "production" },
  },
});
