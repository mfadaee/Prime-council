import { eq } from "drizzle-orm";
import { z } from "zod";
import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { suggestions } from "@/lib/db/schema";
import { audit, startSession } from "@/lib/council/service";

const schema = z.object({ action: z.enum(["discuss", "schedule", "unschedule", "dismiss", "restore"]) });

export const PATCH = route<IdCtx>(async (req, ctx, db) => {
  const { id } = await ctx.params;
  const { action } = await body(req, schema);
  const [s] = await db.select().from(suggestions).where(eq(suggestions.id, id));
  if (!s) throw new HttpError(404, "Suggestion not found");
  await audit(db, "prime", `suggestion.${action}`, id, {});
  if (action === "discuss") {
    if (s.status === "running") throw new HttpError(409, "Already being discussed");
    const { id: sessionId } = await startSession(db, { question: s.question, origin: "suggestion" });
    await db.update(suggestions).set({ status: "done", sessionId }).where(eq(suggestions.id, id));
    return json({ sessionId });
  }
  const next = { schedule: "scheduled", unschedule: "queued", dismiss: "dismissed", restore: "queued" }[action];
  const [row] = await db.update(suggestions).set({ status: next }).where(eq(suggestions.id, id)).returning();
  return json(row);
});
