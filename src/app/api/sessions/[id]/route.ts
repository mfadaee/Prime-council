import { asc, eq } from "drizzle-orm";
import { HttpError, json, route, type IdCtx } from "@/lib/api";
import { councilSessions, sessionEvents } from "@/lib/db/schema";
import { runs } from "@/lib/council/orchestrator";

/** Full session record plus its event log (used for replay and initial render). */
export const GET = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  const [session] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
  if (!session) throw new HttpError(404, "Session not found");
  const rows = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, id)).orderBy(asc(sessionEvents.seq));
  const live = runs.get(id)?.running ?? false;
  return json({
    session: { ...session, live },
    events: rows.map((r) => ({ ...(r.payload as object), seq: r.seq, at: r.at.toISOString(), simulated: r.simulated })),
  });
});
