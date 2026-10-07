import "server-only";
import { and, asc, desc, eq, gt, lt, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { councilSessions, worldEvents, worldSnapshots, worlds, worldTicks } from "@/lib/db/schema";
import { audit, startSession } from "@/lib/council/service";
import type { FinalAnswer } from "@/lib/council/types";
import { newId } from "@/lib/util";
import { councilQuestion, createWorld, decide, parseRecommendation, step } from "./engine";
import { DEFAULT_WORLD_CONFIG, type WorldConfig, type WorldEvent, type WorldState } from "./types";

export const WORLD_ID = "world_main";
const TICK_HISTORY = 900; // per-tick states kept for replay

export const worldConfigSchema = z.object({
  maxPopulation: z.number().int().min(1).max(40),
  maxOrganizations: z.number().int().min(0).max(10),
  growthEnabled: z.boolean(),
  councilThresholdCredits: z.number().min(0).max(1000),
  councilAutoApply: z.boolean(),
});

/** Serialise world mutations per process: one writer at a time. */
let chain: Promise<unknown> = Promise.resolve();
export function withWorldLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

type Row = typeof worlds.$inferSelect;

async function appendEvents(db: Db, state: WorldState, events: WorldEvent[]) {
  if (!events.length) return;
  await db.insert(worldEvents).values(
    events.map((e) => ({ worldId: WORLD_ID, tick: e.tick, type: e.type, payload: { text: e.text, data: e.data, branch: state.branch } })),
  );
}

async function saveState(db: Db, state: WorldState, extra: Partial<Row> = {}) {
  await db.update(worlds).set({ state, tick: state.tick, config: state.config, updatedAt: new Date(), ...extra }).where(eq(worlds.id, WORLD_ID));
  await db
    .insert(worldTicks)
    .values({ worldId: WORLD_ID, tick: state.tick, state })
    .onConflictDoUpdate({ target: [worldTicks.worldId, worldTicks.tick], set: { state } });
  await db.delete(worldTicks).where(and(eq(worldTicks.worldId, WORLD_ID), lt(worldTicks.tick, state.tick - TICK_HISTORY)));
}

export async function getWorld(db: Db): Promise<Row> {
  const [row] = await db.select().from(worlds).where(eq(worlds.id, WORLD_ID));
  if (row) return row;
  const { state, events } = createWorld(42, DEFAULT_WORLD_CONFIG);
  await db.insert(worlds).values({ id: WORLD_ID, name: state.name, seed: state.seed, config: state.config, state, tick: 0 }).onConflictDoNothing();
  await db.insert(worldTicks).values({ worldId: WORLD_ID, tick: 0, state }).onConflictDoNothing();
  await appendEvents(db, state, events);
  const [created] = await db.select().from(worlds).where(eq(worlds.id, WORLD_ID));
  return created;
}

export async function stepWorld(db: Db, n = 1): Promise<WorldState> {
  return withWorldLock(async () => {
    let state = (await getWorld(db)).state as WorldState;
    for (let i = 0; i < n; i++) {
      const r = step(state);
      state = r.state;
      await appendEvents(db, state, r.events);
      await saveState(db, state);
    }
    return state;
  });
}

export async function setWorldStatus(db: Db, status: "running" | "paused", speedMs?: number) {
  await getWorld(db);
  await db
    .update(worlds)
    .set({ status, ...(speedMs ? { speedMs } : {}), updatedAt: new Date() })
    .where(eq(worlds.id, WORLD_ID));
  await audit(db, "prime", `world.${status === "running" ? "play" : "pause"}`, WORLD_ID, { speedMs });
}

export async function decideProject(db: Db, projectId: string, decision: "approve" | "reject", meta: { by: "prime" | "council"; sessionId?: string | null; reason?: string }) {
  return withWorldLock(async () => {
    const state = (await getWorld(db)).state as WorldState;
    const r = decide(state, projectId, decision, meta);
    await appendEvents(db, r.state, r.events);
    await saveState(db, r.state);
    await audit(db, meta.by === "council" ? "council" : "prime", "world.decision", projectId, { decision, sessionId: meta.sessionId ?? null });
    return r.state;
  });
}

/**
 * Ask the council to deliberate on a project. Linked both ways: the session
 * records worldDecisionId; the world records a council.requested event. When the
 * session ends, its recommendation is recorded as a world event, and applied
 * automatically only if the Prime enabled auto-apply and the answer is unambiguous.
 */
export async function requestCouncil(db: Db, projectId: string): Promise<string> {
  const state = (await getWorld(db)).state as WorldState;
  const p = state.projects.find((x) => x.id === projectId);
  if (!p || p.status !== "awaiting_council") throw new Error("Project is not awaiting a decision");
  if (p.sessionId) {
    const [prev] = await db.select({ status: councilSessions.status }).from(councilSessions).where(eq(councilSessions.id, p.sessionId));
    if (prev?.status === "running") throw new Error("The council is already deliberating on this project");
  }
  const { id, run } = await startSession(db, { question: councilQuestion(state, p), origin: "world", worldDecisionId: projectId });
  await withWorldLock(async () => {
    const s = (await getWorld(db)).state as WorldState;
    const proj = s.projects.find((x) => x.id === projectId);
    if (proj) proj.sessionId = id;
    const ev: WorldEvent = { type: "council.requested", tick: s.tick, text: `The Prime asks the council to deliberate on ${p.name}.`, data: { projectId, sessionId: id } };
    await appendEvents(db, s, [ev]);
    await saveState(db, s);
  });
  await audit(db, "prime", "world.council_requested", projectId, { sessionId: id });
  void run.done.then(() => recordRecommendation(db, projectId, id)).catch((e) => console.error("[world]", e));
  return id;
}

export async function recordRecommendation(db: Db, projectId: string, sessionId: string) {
  const [session] = await db.select().from(councilSessions).where(eq(councilSessions.id, sessionId));
  const final = session?.final as FinalAnswer | null;
  const rec = final ? parseRecommendation(final.answer) : null;
  const world = await getWorld(db);
  const state = world.state as WorldState;
  const text = !final
    ? `The council session on this project ended without an answer (${session?.status ?? "unknown"}).`
    : rec
      ? `The council recommends: ${rec.toUpperCase()}${session?.simulated ? " (simulated session)" : ""}.`
      : `The council answered without a clear APPROVE/REJECT recommendation${session?.simulated ? " (simulated demo session)" : ""}; the Prime decides.`;
  await withWorldLock(async () => {
    const s = (await getWorld(db)).state as WorldState;
    await appendEvents(db, s, [{ type: "council.recommendation", tick: s.tick, text, data: { projectId, sessionId, recommendation: rec, simulated: session?.simulated ?? false } }]);
  });
  const p = state.projects.find((x) => x.id === projectId);
  if (rec && state.config.councilAutoApply && p?.status === "awaiting_council" && !session?.simulated) {
    await decideProject(db, projectId, rec, { by: "council", sessionId, reason: "Applied automatically (auto-apply is on)." });
  }
  return rec;
}

export async function latestRecommendation(db: Db, projectId: string) {
  const rows = await db
    .select()
    .from(worldEvents)
    .where(and(eq(worldEvents.worldId, WORLD_ID), eq(worldEvents.type, "council.recommendation")))
    .orderBy(desc(worldEvents.id))
    .limit(50);
  const hit = rows.find((r) => (r.payload as { data: { projectId: string } }).data.projectId === projectId);
  return hit ? (hit.payload as { data: { recommendation: "approve" | "reject" | null; sessionId: string; simulated: boolean } }).data : null;
}

export async function setWorldConfig(db: Db, config: WorldConfig) {
  return withWorldLock(async () => {
    const s = (await getWorld(db)).state as WorldState;
    s.config = worldConfigSchema.parse(config);
    await appendEvents(db, s, [{ type: "world.config", tick: s.tick, text: `The Prime updated the world rules: max population ${config.maxPopulation}, max organisations ${config.maxOrganizations}, growth ${config.growthEnabled ? "on" : "off"}, council threshold ${config.councilThresholdCredits} credits.`, data: { ...config } }]);
    await saveState(db, s);
    await audit(db, "prime", "world.config", WORLD_ID, { ...config });
    return s;
  });
}

export async function createSnapshot(db: Db, label: string) {
  const world = await getWorld(db);
  const [row] = await db.insert(worldSnapshots).values({ id: newId("snap"), worldId: WORLD_ID, tick: world.tick, label, state: world.state }).returning();
  await audit(db, "prime", "world.snapshot", row.id, { tick: world.tick, label });
  return row;
}

export async function listSnapshots(db: Db) {
  return db
    .select({ id: worldSnapshots.id, tick: worldSnapshots.tick, label: worldSnapshots.label, createdAt: worldSnapshots.createdAt })
    .from(worldSnapshots)
    .where(eq(worldSnapshots.worldId, WORLD_ID))
    .orderBy(desc(worldSnapshots.createdAt))
    .limit(50);
}

/** Restore a snapshot: starts a new branch; later per-tick history is discarded, events are kept. */
export async function restoreSnapshot(db: Db, snapshotId: string) {
  return withWorldLock(async () => {
    const [snap] = await db.select().from(worldSnapshots).where(eq(worldSnapshots.id, snapshotId));
    if (!snap) throw new Error("Snapshot not found");
    const current = (await getWorld(db)).state as WorldState;
    const state = structuredClone(snap.state as WorldState);
    state.branch = current.branch + 1;
    await db.delete(worldTicks).where(and(eq(worldTicks.worldId, WORLD_ID), gt(worldTicks.tick, state.tick)));
    await appendEvents(db, state, [{ type: "world.restored", tick: state.tick, text: `The Prime restored snapshot “${snap.label}” (tick ${snap.tick}). Branch ${state.branch} begins.`, data: { snapshotId, fromTick: current.tick } }]);
    await saveState(db, state, { status: "paused" });
    await audit(db, "prime", "world.restore", snapshotId, { tick: snap.tick });
    return state;
  });
}

export async function resetWorld(db: Db, seed: number, config: WorldConfig) {
  return withWorldLock(async () => {
    const { state, events } = createWorld(seed, worldConfigSchema.parse(config));
    const current = await getWorld(db);
    state.branch = ((current.state as WorldState).branch ?? 0) + 1;
    await db.delete(worldTicks).where(eq(worldTicks.worldId, WORLD_ID));
    await appendEvents(db, state, events);
    await db.update(worlds).set({ seed, status: "paused" }).where(eq(worlds.id, WORLD_ID));
    await saveState(db, state);
    await audit(db, "prime", "world.reset", WORLD_ID, { seed });
    return state;
  });
}

export async function stateAtTick(db: Db, tick: number) {
  const [row] = await db
    .select()
    .from(worldTicks)
    .where(and(eq(worldTicks.worldId, WORLD_ID), lte(worldTicks.tick, tick)))
    .orderBy(desc(worldTicks.tick))
    .limit(1);
  return row ? (row.state as WorldState) : null;
}

export async function tickRange(db: Db) {
  const [first] = await db.select({ tick: worldTicks.tick }).from(worldTicks).where(eq(worldTicks.worldId, WORLD_ID)).orderBy(asc(worldTicks.tick)).limit(1);
  return first?.tick ?? 0;
}

export async function recentEvents(db: Db, limit = 80, beforeTick?: number) {
  const where = beforeTick === undefined ? eq(worldEvents.worldId, WORLD_ID) : and(eq(worldEvents.worldId, WORLD_ID), lte(worldEvents.tick, beforeTick));
  const rows = await db.select().from(worldEvents).where(where).orderBy(desc(worldEvents.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, tick: r.tick, type: r.type, ...(r.payload as { text: string; data: Record<string, unknown>; branch: number }), at: r.at.toISOString() }));
}
