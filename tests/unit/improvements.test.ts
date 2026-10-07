import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { improvementSchema } from "@/lib/improvements/history";

describe("improvement log", () => {
  it("data/improvements.json is valid (the daily job appends to it)", () => {
    const raw = JSON.parse(readFileSync("data/improvements.json", "utf8"));
    const r = z.array(improvementSchema).safeParse(raw);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });
});
