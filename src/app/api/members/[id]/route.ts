import { eq } from "drizzle-orm";
import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { members, providers } from "@/lib/db/schema";
import { audit } from "@/lib/council/service";
import { memberUpdateSchema } from "@/lib/council/members";

export const PATCH = route<IdCtx>(async (req, ctx, db) => {
  const { id } = await ctx.params;
  const patch = await body(req, memberUpdateSchema);
  if (patch.providerId) {
    const [p] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, patch.providerId));
    if (!p) throw new HttpError(400, "Unknown provider");
  }
  const [row] = await db.update(members).set({ ...patch, updatedAt: new Date() }).where(eq(members.id, id)).returning();
  if (!row) throw new HttpError(404, "Member not found");
  await audit(db, "prime", "member.update", id, patch);
  return json(row);
});

export const DELETE = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  const [row] = await db.delete(members).where(eq(members.id, id)).returning();
  if (!row) throw new HttpError(404, "Member not found");
  await audit(db, "prime", "member.delete", id, {});
  return json({ ok: true });
});
