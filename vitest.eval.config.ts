import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Opt-in evaluation of Beyond the System against real models (spends real budget).
 * Run with `BEYOND_EVAL=1 npm run eval:beyond`. Never part of `npm test` or CI.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/eval/**/*.eval.ts"],
    environment: "node",
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
  },
});
