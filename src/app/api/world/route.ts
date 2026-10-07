import { z } from "zod";
import { body, HttpError, json, route } from "@/lib/api";
import {
  createSnapshot,
  decideProject,
  getWorld,
  latestRecommendation,
  listSnapshots,
  recentEvents,
  requestCouncil,
  resetWorld,
  restoreSnapshot,
  setWorldConfig,
  setWorldStatus,
  stepWorld,
  tickRange,
  worldConfigSchema,
} from "@/lib/sim/store";
import type { WorldState } from "@/lib/sim/types";
import { getAutonomy } from "@/lib/settings";
import { RULES, take } from "@/lib/security/rate-limit";

export const GET = route(async (_req, _ctx, db) => {
  const world = await getWorld(db);
  const state = world.state as WorldState;
  const pending = state.projects.filter((p) => p.status === "awaiting_council");
  const recommendations = Object.fromEntries(await Promise.all(pending.map(async (p) => [p.id, await latestRecommendation(db, p.id)] as const)));
  return json({
    world: { id: world.id, status: world.status, speedMs: world.speedMs, tick: world.tick, seed: world.seed, firstTick: await tickRange(db) },
    globalPause: (await getAutonomy(db)).globalPause,
    state,
    events: await recentEvents(db, 80),
    snapshots: await listSnapshots(db),
    recommendations,
  });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play"), speedMs: z.number().int().min(250).max(10_000).optional() }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("speed"), speedMs: z.number().int().min(250).max(10_000) }),
  z.object({ action: z.literal("step"), steps: z.number().int().min(1).max(30).default(1) }),
  z.object({ action: z.literal("decide"), projectId: z.string().max(80), decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("apply_recommendation"), projectId: z.string().max(80) }),
  z.object({ action: z.literal("ask_council"), projectId: z.string().max(80) }),
  z.object({ action: z.literal("snapshot"), label: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("restore"), snapshotId: z.string().max(80) }),
  z.object({ action: z.literal("reset"), seed: z.number().int().min(0).max(2 ** 31 - 1), config: worldConfigSchema }),
  z.object({ action: z.literal("config"), config: worldConfigSchema }),
]);

export const POST = route(async (req, _ctx, db) => {
  const a = await body(req, actionSchema);
  try {
    switch (a.action) {
      case "play":
        await setWorldStatus(db, "running", a.speedMs);
        return json({ ok: true });
      case "pause":
        await setWorldStatus(db, "paused");
        return json({ ok: true });
      case "speed": {
        const w = await getWorld(db);
        await setWorldStatus(db, w.status as "running" | "paused", a.speedMs);
        return json({ ok: true });
      }
      case "step": {
        const w = await getWorld(db);
        if (w.status === "running") throw new HttpError(409, "Pause the world before stepping manually.");
        const s = await stepWorld(db, a.steps);
        return json({ ok: true, tick: s.tick });
      }
      case "decide":
        await decideProject(db, a.projectId, a.decision, { by: "prime", reason: a.reason });
        return json({ ok: true });
      case "apply_recommendation": {
        const rec = await latestRecommendation(db, a.projectId);
        if (!rec?.recommendation) throw new HttpError(409, "There is no clear council recommendation to apply.");
        await decideProject(db, a.projectId, rec.recommendation, { by: "council", sessionId: rec.sessionId, reason: "Applied by the Founder from the council's recommendation." });
        return json({ ok: true, decision: rec.recommendation });
      }
      case "ask_council": {
        if (!take("local:expensive", RULES.expensive).ok) throw new HttpError(429, "Too many model-calling actions — wait a moment.");
        const sessionId = await requestCouncil(db, a.projectId);
        return json({ ok: true, sessionId });
      }
      case "snapshot":
        return json({ ok: true, snapshot: await createSnapshot(db, a.label) });
      case "restore":
        await restoreSnapshot(db, a.snapshotId);
        return json({ ok: true });
      case "reset":
        await resetWorld(db, a.seed, a.config);
        return json({ ok: true });
      case "config":
        await setWorldConfig(db, a.config);
        return json({ ok: true });
    }
  } catch (err) {
    if (err instanceof HttpError || err instanceof z.ZodError) throw err;
    throw new HttpError(409, err instanceof Error ? err.message : String(err));
  }
});
