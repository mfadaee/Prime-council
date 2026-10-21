import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { discoveryPatchSchema, getDiscovery, updateDiscovery } from "@/lib/discovery/service";

export const GET = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  const detail = await getDiscovery(db, id);
  if (!detail) throw new HttpError(404, "Discovery not found");
  return json(detail);
});

/** Founder updates: experiment status and results, assumption outcomes, lessons, follow-up decisions. */
export const PATCH = route<IdCtx>(async (req, ctx, db) => {
  const { id } = await ctx.params;
  const patch = await body(req, discoveryPatchSchema);
  try {
    const updated = await updateDiscovery(db, id, patch);
    if (!updated) throw new HttpError(404, "Discovery not found");
    return json({ discovery: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "This discovery has no experiment") throw new HttpError(409, err.message);
    throw err;
  }
});
