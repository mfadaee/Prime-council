import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/improvements/eligibility";

const base = { labels: ["low-risk"], author: "claude[bot]", allowedAuthors: ["claude[bot]"] };
const file = (path: string, n = 10, status = "modified") => ({ path, additions: n, deletions: 0, status });

describe("auto-merge eligibility", () => {
  it("allows a small low-risk UI change", () => {
    expect(checkEligibility({ ...base, files: [file("src/components/council/Transcript.tsx"), file("tests/unit/reducer.test.ts")] })).toEqual({ eligible: true, reasons: [] });
  });

  it.each([
    ["src/proxy.ts", "authentication"],
    ["src/app/api/auth/route.ts", "authentication"],
    [".env.example", "secrets"],
    ["src/lib/council/budget.ts", "spending"],
    ["src/lib/providers/pricing.ts", "spending"],
    ["src/lib/providers/adapters/openai.ts", "external provider"],
    ["drizzle/0001_change.sql", "migrations"],
    [".github/workflows/ci.yml", "workflows"],
    ["package.json", "dependencies"],
    ["src/lib/improvements/eligibility.ts", "auto-merge rules"],
  ])("keeps changes to %s reviewable (%s)", (path) => {
    const r = checkEligibility({ ...base, files: [file(path)] });
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(" ")).toContain(path);
  });

  it("requires the low-risk label and an allowed author", () => {
    expect(checkEligibility({ ...base, labels: [], files: [file("src/app/page.tsx")] }).eligible).toBe(false);
    expect(checkEligibility({ ...base, labels: ["low-risk", "needs-review"], files: [file("src/app/page.tsx")] }).eligible).toBe(false);
    expect(checkEligibility({ ...base, author: "someone", files: [file("src/app/page.tsx")] }).eligible).toBe(false);
  });

  it("rejects large or destructive changes", () => {
    expect(checkEligibility({ ...base, files: [file("src/app/page.tsx", 401)] }).eligible).toBe(false);
    expect(checkEligibility({ ...base, files: Array.from({ length: 16 }, (_, i) => file(`src/components/x${i}.tsx`, 1)) }).eligible).toBe(false);
    expect(checkEligibility({ ...base, files: [file("src/components/council/Chamber.tsx", 5, "removed")] }).eligible).toBe(false);
  });
});
