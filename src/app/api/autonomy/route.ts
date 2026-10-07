import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { councilSessions } from "@/lib/db/schema";
import { audit, dailySpend } from "@/lib/council/service";
import { backgroundRunning, schedulerStatus, stopBackgroundRuns, tick } from "@/lib/autonomy/scheduler";
import { getAutonomy, setAutonomy } from "@/lib/settings";
import { startOfUtcDay } from "@/lib/util";

export const GET = route(async (_req, _ctx, db) => {
  const a = await getAutonomy(db);
  const today = await db
    .select({ id: councilSessions.id })
    .from(councilSessions)
    .where(and(eq(councilSessions.origin, "background"), gte(councilSessions.startedAt, startOfUtcDay())));
  return json({
    settings: a,
    scheduler: schedulerStatus(),
    backgroundRunning: backgroundRunning(),
    backgroundSessionsToday: today.length,
    backgroundSpendTodayUsd: await dailySpend(db, "background"),
  });
});

const schema = z.object({ action: z.enum(["pause", "resume", "tick"]) });

/** Global pause/resume (takes effect immediately) and "run a scheduler check now". */
export const POST = route(async (req, _ctx, db) => {
  const { action } = await body(req, schema);
  const a = await getAutonomy(db);
  if (action === "pause") {
    await setAutonomy(db, { ...a, globalPause: true });
    const stopped = stopBackgroundRuns("Global pause");
    await audit(db, "prime", "autonomy.pause", null, { stoppedBackgroundSessions: stopped });
    return json({ ok: true, stopped });
  }
  if (action === "resume") {
    await setAutonomy(db, { ...a, globalPause: false });
    await audit(db, "prime", "autonomy.resume", null, {});
    return json({ ok: true });
  }
  const r = await tick(db);
  await audit(db, "prime", "autonomy.tick", r.sessionId ?? null, { outcome: r.outcome });
  return json(r);
});
