import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLog, councilSessions, worldTicks } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/council/seed";
import { runs } from "@/lib/council/orchestrator";
import {
  createSnapshot,
  decideProject,
  getWorld,
  latestRecommendation,
  recentEvents,
  requestCouncil,
  restoreSnapshot,
  setWorldConfig,
  stateAtTick,
  stepWorld,
} from "@/lib/sim/store";
import { DEFAULT_WORLD_CONFIG, type WorldState } from "@/lib/sim/types";
import { setup, waitFor } from "./helpers";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await setup());
  await ensureSeeded(db);
});
afterEach(async () => {
  for (const r of runs.values()) await r.done.catch(() => {});
  runs.clear();
  await new Promise((r) => setTimeout(r, 200));
  await close();
});

async function untilCouncil(): Promise<WorldState> {
  await setWorldConfig(db, { ...DEFAULT_WORLD_CONFIG, councilThresholdCredits: 10 });
  for (let i = 0; i < 40; i++) {
    const s = await stepWorld(db, 1);
    if (s.projects.some((p) => p.status === "awaiting_council")) return s;
  }
  throw new Error("no council project");
}

describe("world store", () => {
  it("persists every tick for replay and logs events", async () => {
    await getWorld(db);
    const s = await stepWorld(db, 9);
    expect(s.tick).toBe(9);
    const past = await stateAtTick(db, 4);
    expect(past?.tick).toBe(4);
    const ticks = await db.select().from(worldTicks);
    expect(ticks.length).toBe(10);
    const events = await recentEvents(db);
    expect(events.some((e) => e.type === "world.created")).toBe(true);
    expect(events.some((e) => e.type === "trade")).toBe(true);
  });

  it("links a council session to a world decision through explicit events (demo mode)", async () => {
    const s = await untilCouncil();
    const project = s.projects.find((p) => p.status === "awaiting_council")!;
    const sessionId = await requestCouncil(db, project.id);
    const [session] = await db.select().from(councilSessions).where(eq(councilSessions.id, sessionId));
    expect(session.origin).toBe("world");
    expect(session.worldDecisionId).toBe(project.id);
    expect(session.question).toMatch(/Simulated world/);
    await expect(requestCouncil(db, project.id)).rejects.toThrow(/already deliberating/);
    await runs.get(sessionId)!.done;
    await waitFor(() => true);
    let rec = await latestRecommendation(db, project.id);
    for (let i = 0; i < 50 && !rec; i++) {
      await new Promise((r) => setTimeout(r, 50));
      rec = await latestRecommendation(db, project.id);
    }
    // The demo synthesizer gives no DECISION line, so nothing is applied automatically.
    expect(rec).toMatchObject({ sessionId, recommendation: null, simulated: true });
    const after = (await getWorld(db)).state as WorldState;
    expect(after.projects.find((p) => p.id === project.id)!.status).toBe("awaiting_council");

    // The Prime decides; the decision is recorded and audited.
    const decided = await decideProject(db, project.id, "approve", { by: "prime" });
    expect(["approved", "active"]).toContain(decided.projects.find((p) => p.id === project.id)!.status);
    const events = await recentEvents(db);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["council.requested", "council.recommendation", "council.decision"]));
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "world.decision"));
    expect(audits).toHaveLength(1);
  }, 60_000);

  it("restores a snapshot onto a new branch and replays identically", async () => {
    await stepWorld(db, 6);
    const snap = await createSnapshot(db, "early");
    const original = await stepWorld(db, 12);
    const restored = await restoreSnapshot(db, snap.id);
    expect(restored.tick).toBe(6);
    expect(restored.branch).toBe(1);
    expect((await getWorld(db)).status).toBe("paused");
    expect(await stateAtTick(db, 17)).toMatchObject({ tick: 6 }); // later history discarded → falls back to the restore point
    const replayed = await stepWorld(db, 12);
    expect({ ...replayed, branch: 0 }).toEqual({ ...original, branch: 0 });
  });
});
