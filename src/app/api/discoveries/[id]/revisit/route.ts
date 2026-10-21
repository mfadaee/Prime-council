import { z } from "zod";
import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { revisitDiscovery } from "@/lib/discovery/service";

const schema = z.object({ focus: z.string().trim().max(1000).optional() });

/** Start a new exploration that builds on this investigation instead of starting over. */
export const POST = route<IdCtx>(
  async (req, ctx, db) => {
    const { id } = await ctx.params;
    const { focus } = await body(req, schema);
    const sessionId = await revisitDiscovery(db, id, focus);
    if (!sessionId) throw new HttpError(404, "Discovery not found");
    return json({ sessionId }, { status: 201 });
  },
  { rate: "expensive" },
);
