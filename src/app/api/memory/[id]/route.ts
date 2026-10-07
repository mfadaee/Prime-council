import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { deleteMemory, memoryPatchSchema, updateMemory } from "@/lib/memory/service";

export const PATCH = route<IdCtx>(async (req, ctx, db) => {
  const { id } = await ctx.params;
  const row = await updateMemory(db, id, await body(req, memoryPatchSchema));
  if (!row) throw new HttpError(404, "Memory item not found");
  await audit(db, "prime", "memory.update", id, { enabled: row.enabled, kind: row.kind });
  return json(row);
});

export const DELETE = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  const row = await deleteMemory(db, id);
  if (!row) throw new HttpError(404, "Memory item not found");
  await audit(db, "prime", "memory.delete", id, {});
  return json({ ok: true });
});
