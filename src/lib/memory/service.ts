import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { memoryItems } from "@/lib/db/schema";
import { newId } from "@/lib/util";

export const MEMORY_KINDS = ["interest", "fact", "preference", "decision", "note", "imported"] as const;

export const memoryCreateSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  content: z.string().trim().min(1).max(1000),
  enabled: z.boolean().default(true),
  source: z.enum(["prime", "session"]).default("prime"),
  sourceRef: z.string().max(80).nullable().optional(),
});

export const memoryPatchSchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  content: z.string().trim().min(1).max(1000).optional(),
  enabled: z.boolean().optional(),
});

export const importSchema = z.object({
  text: z.string().max(100_000),
  label: z.string().trim().max(80).optional(),
});

export async function listMemory(db: Db) {
  return db.select().from(memoryItems).orderBy(desc(memoryItems.updatedAt));
}

export async function createMemory(db: Db, input: z.infer<typeof memoryCreateSchema>) {
  const [row] = await db
    .insert(memoryItems)
    .values({ id: newId("mem"), ...input, sourceRef: input.sourceRef ?? null })
    .returning();
  return row;
}

export async function updateMemory(db: Db, id: string, patch: z.infer<typeof memoryPatchSchema>) {
  const [row] = await db
    .update(memoryItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(memoryItems.id, id))
    .returning();
  return row ?? null;
}

export async function deleteMemory(db: Db, id: string) {
  const [row] = await db.delete(memoryItems).where(eq(memoryItems.id, id)).returning();
  return row ?? null;
}

/**
 * Split pasted notes or an exported conversation list into candidate items.
 * Accepts plain lines, Markdown bullets, or a JSON array of strings / {content}.
 * Imported content is untrusted: items start DISABLED until the Founder reviews
 * them, and are always wrapped as untrusted data when used in prompts.
 */
export function parseImport(text: string): string[] {
  const trimmed = text.trim();
  let lines: string[] = [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown[];
      lines = arr
        .map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "content" in x ? String((x as { content: unknown }).content) : ""))
        .filter(Boolean);
    } catch {
      lines = trimmed.split(/\r?\n/);
    }
  } else {
    lines = trimmed.split(/\r?\n/);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 3) continue;
    const clipped = line.slice(0, 1000);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= 200) break;
  }
  return out;
}

export async function importMemory(db: Db, text: string, label?: string) {
  const items = parseImport(text);
  if (!items.length) return [];
  return db
    .insert(memoryItems)
    .values(items.map((content) => ({ id: newId("mem"), kind: "imported", content, source: "import", sourceRef: label ?? null, enabled: false })))
    .returning();
}
