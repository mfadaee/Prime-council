import "server-only";
import { desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { discoveries } from "@/lib/db/schema";
import { relatedDiscoveries } from "@/lib/council/beyond";
import { audit, startSession } from "@/lib/council/service";
import { toRecord } from "./record";
import { ASSUMPTION_STATUSES, DISCOVERY_STATUSES, EXPERIMENT_STATUSES, FOLLOW_UP_STATUSES, type DiscoveryExperiment, type DiscoveryRecord, type FollowUp } from "./types";

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listDiscoveries(db: Db, q = "", limit = 50) {
  const term = q.trim().toLowerCase().slice(0, 200);
  const rows = await db
    .select()
    .from(discoveries)
    .where(term ? ilike(discoveries.searchText, `%${escapeLike(term)}%`) : undefined)
    .orderBy(desc(discoveries.updatedAt))
    .limit(limit);
  return rows.map(toRecord);
}

export interface DiscoveryDetail {
  discovery: DiscoveryRecord;
  parent: { id: string; question: string } | null;
  revisits: { id: string; question: string; createdAt: string }[];
  /** Other investigations resting on similar assumptions (recurring assumptions across domains). */
  related: ReturnType<typeof relatedDiscoveries>;
}

export async function getDiscovery(db: Db, id: string): Promise<DiscoveryDetail | null> {
  const [row] = await db.select().from(discoveries).where(eq(discoveries.id, id));
  if (!row) return null;
  const discovery = toRecord(row);
  const recent = (await db.select().from(discoveries).orderBy(desc(discoveries.updatedAt)).limit(200)).map(toRecord);
  const parent = discovery.parentId ? (recent.find((d) => d.id === discovery.parentId) ?? (await one(db, discovery.parentId))) : null;
  return {
    discovery,
    parent: parent ? { id: parent.id, question: parent.question } : null,
    revisits: recent.filter((d) => d.parentId === id).map((d) => ({ id: d.id, question: d.question, createdAt: d.createdAt })),
    related: relatedDiscoveries(discovery, recent.filter((d) => d.id !== id && d.id !== discovery.parentId && d.parentId !== id)),
  };
}

async function one(db: Db, id: string): Promise<DiscoveryRecord | null> {
  const [row] = await db.select().from(discoveries).where(eq(discoveries.id, id));
  return row ? toRecord(row) : null;
}

/**
 * Founder updates (stage G): experiment status and results, what became of each
 * assumption, lessons, and decisions on follow-ups. Approving a proposed change to
 * the council records the decision only — it still goes through a branch, tests,
 * CI and pull-request review (see changePolicy).
 */
export const discoveryPatchSchema = z.object({
  status: z.enum(DISCOVERY_STATUSES).optional(),
  experiment: z
    .object({
      status: z.enum(EXPERIMENT_STATUSES),
      result: z
        .object({ outcome: z.enum(["supported", "refuted", "inconclusive"]), observations: z.string().trim().min(1).max(4000) })
        .nullable()
        .optional(),
    })
    .optional(),
  assumptions: z
    .array(z.object({ id: z.string().max(10), status: z.enum(ASSUMPTION_STATUSES), revision: z.string().trim().max(1000).optional() }))
    .max(20)
    .optional(),
  lessons: z.array(z.string().trim().min(1).max(1000)).max(30).optional(),
  followUps: z.array(z.object({ id: z.string().max(40), status: z.enum(FOLLOW_UP_STATUSES) })).max(20).optional(),
});

export async function updateDiscovery(db: Db, id: string, patch: z.infer<typeof discoveryPatchSchema>): Promise<DiscoveryRecord | null> {
  const current = await one(db, id);
  if (!current) return null;
  const next: Partial<typeof discoveries.$inferInsert> = { updatedAt: new Date() };
  if (patch.status) next.status = patch.status;
  if (patch.experiment) {
    if (!current.experiment) throw new Error("This discovery has no experiment");
    const exp: DiscoveryExperiment = {
      ...current.experiment,
      status: patch.experiment.status,
      result: patch.experiment.result === undefined ? current.experiment.result : patch.experiment.result && { ...patch.experiment.result, recordedAt: new Date().toISOString() },
    };
    next.experiment = exp;
    if (!patch.status && exp.status === "running" && current.status === "open") next.status = "experimenting";
  }
  if (patch.assumptions) {
    const byId = new Map(patch.assumptions.map((a) => [a.id, a]));
    next.assumptions = current.assumptions.map((a) => {
      const p = byId.get(a.id);
      return p ? { ...a, status: p.status, revision: p.revision ?? a.revision } : a;
    });
  }
  if (patch.lessons) next.lessons = patch.lessons;
  if (patch.followUps) {
    const byId = new Map(patch.followUps.map((f) => [f.id, f.status]));
    next.followUps = current.followUps.map((f): FollowUp => (byId.has(f.id) ? { ...f, status: byId.get(f.id)! } : f));
  }
  const lessons = (next.lessons as string[] | undefined) ?? current.lessons;
  next.searchText = [current.question, current.framing, ...current.assumptions.map((a) => a.statement), ...current.alternatives.map((a) => `${a.title} ${a.description}`), current.answer, ...lessons]
    .join(" \n ")
    .toLowerCase()
    .slice(0, 20_000);
  await db.update(discoveries).set(next).where(eq(discoveries.id, id));
  await audit(db, "prime", "discovery.update", id, patch);
  return one(db, id);
}

/** Revisit an investigation: a new exploration that starts from what was already learned. */
export async function revisitDiscovery(db: Db, id: string, focus?: string) {
  const d = await one(db, id);
  if (!d) return null;
  const question = focus?.trim() ? `${focus.trim()} (building on the earlier investigation: ${d.question})` : d.question;
  const { id: sessionId } = await startSession(db, { question: question.slice(0, 4000), origin: "prime", mode: "beyond", parentDiscoveryId: id });
  return sessionId;
}
