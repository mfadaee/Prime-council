import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { DEFAULT_LIMITS, type Limits } from "@/lib/council/types";
import type { PriceTable } from "@/lib/providers/pricing";

/** Server-enforced ceilings: settings can never be raised past these. */
export const LIMIT_BOUNDS = {
  maxRounds: [0, 3],
  hardMaxRounds: [1, 5],
  concurrency: [1, 6],
  maxOutputTokens: [128, 4000],
  timeoutMs: [5_000, 180_000],
  maxRetries: [0, 3],
  sessionBudgetUsd: [0, 20],
  dailyBudgetUsd: [0, 100],
  sessionWallClockMs: [30_000, 20 * 60_000],
} as const;

const num = (k: keyof typeof LIMIT_BOUNDS) => z.number().finite().min(LIMIT_BOUNDS[k][0]).max(LIMIT_BOUNDS[k][1]);

export const limitsSchema = z.object({
  maxRounds: num("maxRounds").int(),
  hardMaxRounds: num("hardMaxRounds").int(),
  concurrency: num("concurrency").int(),
  maxOutputTokens: num("maxOutputTokens").int(),
  timeoutMs: num("timeoutMs").int(),
  maxRetries: num("maxRetries").int(),
  sessionBudgetUsd: num("sessionBudgetUsd"),
  dailyBudgetUsd: num("dailyBudgetUsd"),
  sessionWallClockMs: num("sessionWallClockMs").int(),
  allowUnpriced: z.boolean(),
});

export interface AutonomySettings {
  /** Members may propose topics from approved interests. Default off. */
  suggestionsEnabled: boolean;
  /** Scheduled background sessions. Default off. */
  backgroundEnabled: boolean;
  /** Minutes between background sessions. */
  intervalMinutes: number;
  /** Max background sessions per UTC day. */
  maxSessionsPerDay: number;
  /** Separate daily budget for background activity (USD, estimated). */
  backgroundDailyBudgetUsd: number;
  /** Global pause for all autonomous activity (background sessions + world autorun). */
  globalPause: boolean;
}

export const DEFAULT_AUTONOMY: AutonomySettings = {
  suggestionsEnabled: false,
  backgroundEnabled: false,
  intervalMinutes: 60,
  maxSessionsPerDay: 3,
  backgroundDailyBudgetUsd: 0.25,
  globalPause: false,
};

export const autonomySchema = z.object({
  suggestionsEnabled: z.boolean(),
  backgroundEnabled: z.boolean(),
  intervalMinutes: z.number().int().min(15).max(24 * 60),
  maxSessionsPerDay: z.number().int().min(0).max(24),
  backgroundDailyBudgetUsd: z.number().min(0).max(20),
  globalPause: z.boolean(),
});

export const priceTableSchema = z.record(
  z.string().min(3).max(200),
  z.object({ inputPerM: z.number().min(0).max(1000), outputPerM: z.number().min(0).max(1000) }),
);

async function read<T>(db: Db, key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows[0] ? { ...fallback, ...(rows[0].value as object) } : fallback;
}

async function write(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getLimits(db: Db): Promise<Limits> {
  const merged = await read(db, "limits", DEFAULT_LIMITS);
  const parsed = limitsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_LIMITS;
}
export async function setLimits(db: Db, limits: Limits): Promise<Limits> {
  const v = limitsSchema.parse(limits);
  await write(db, "limits", v);
  return v;
}

export async function getAutonomy(db: Db): Promise<AutonomySettings> {
  const merged = await read(db, "autonomy", DEFAULT_AUTONOMY);
  const parsed = autonomySchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_AUTONOMY;
}
export async function setAutonomy(db: Db, a: AutonomySettings): Promise<AutonomySettings> {
  const v = autonomySchema.parse(a);
  await write(db, "autonomy", v);
  return v;
}

export async function getPricing(db: Db): Promise<PriceTable> {
  const rows = await db.select().from(settings).where(eq(settings.key, "pricing"));
  const parsed = priceTableSchema.safeParse(rows[0]?.value ?? {});
  return parsed.success ? parsed.data : {};
}
export async function setPricing(db: Db, table: PriceTable): Promise<PriceTable> {
  const v = priceTableSchema.parse(table);
  await write(db, "pricing", v);
  return v;
}
