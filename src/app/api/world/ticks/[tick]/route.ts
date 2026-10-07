import { HttpError, json, route } from "@/lib/api";
import { recentEvents, stateAtTick } from "@/lib/sim/store";

/** World state as it was at a past tick (replay). */
export const GET = route<{ params: Promise<{ tick: string }> }>(async (_req, ctx, db) => {
  const tick = Number((await ctx.params).tick);
  if (!Number.isInteger(tick) || tick < 0) throw new HttpError(400, "Invalid tick");
  const state = await stateAtTick(db, tick);
  if (!state) throw new HttpError(404, "That tick is outside the stored replay window");
  return json({ state, events: await recentEvents(db, 40, tick) });
});
