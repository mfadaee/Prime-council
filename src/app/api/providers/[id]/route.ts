import { eq } from "drizzle-orm";
import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { members, providers } from "@/lib/db/schema";
import { audit } from "@/lib/council/service";
import { publicProvider } from "@/lib/providers/registry";
import { providerPatch as patchSchema } from "@/lib/providers/schema";

export const PATCH = route<IdCtx>(async (req, ctx, db) => {
  const { id } = await ctx.params;
  if (id === "demo") throw new HttpError(400, "The demo provider cannot be edited");
  const patch = await body(req, patchSchema);
  const [row] = await db
    .update(providers)
    .set({ ...patch, lastCheckStatus: null, lastCheckDetail: null, updatedAt: new Date() })
    .where(eq(providers.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Provider not found");
  await audit(db, "prime", "provider.update", id, patch);
  return json(publicProvider(row));
});

export const DELETE = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  if (id === "demo") throw new HttpError(400, "The demo provider cannot be removed");
  const users = await db.select({ id: members.id }).from(members).where(eq(members.providerId, id));
  if (users.length) throw new HttpError(409, `Used by ${users.map((u) => u.id).join(", ")} — reassign those members first`);
  const [row] = await db.delete(providers).where(eq(providers.id, id)).returning();
  if (!row) throw new HttpError(404, "Provider not found");
  await audit(db, "prime", "provider.delete", id, {});
  return json({ ok: true });
});
