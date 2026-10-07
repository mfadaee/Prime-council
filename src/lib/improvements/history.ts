import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const improvementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(3).max(200),
  purpose: z.string().min(3).max(2000),
  change: z.string().min(3).max(4000),
  validation: z.string().min(3).max(4000),
  risk: z.enum(["low", "review"]),
  remainingIssues: z.string().max(4000),
  branch: z.string().max(200).nullable(),
  pr: z.union([z.string().url(), z.number().int(), z.null()]),
});
export type Improvement = z.infer<typeof improvementSchema>;

/** The improvement log maintained by the daily job (data/improvements.json). */
export async function readImprovements(): Promise<{ items: Improvement[]; error: string | null }> {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "improvements.json"), "utf8");
    const parsed = z.array(improvementSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) return { items: [], error: "data/improvements.json does not match the expected format" };
    return { items: [...parsed.data].reverse(), error: null };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
