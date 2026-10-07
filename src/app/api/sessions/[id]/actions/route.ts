import { z } from "zod";
import { body, HttpError, json, route, type IdCtx } from "@/lib/api";
import { applyAction } from "@/lib/council/service";
import { RULES, take } from "@/lib/security/rate-limit";

const memberId = z.string().min(1).max(80);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("exclude"), memberId }),
  z.object({ type: z.literal("include"), memberId }),
  z.object({ type: z.literal("another_round") }),
  z.object({ type: z.literal("challenge"), claim: z.string().trim().min(3).max(1000) }),
  z.object({ type: z.literal("direct"), memberId, message: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("override"), decision: z.string().trim().min(1).max(8000), note: z.string().trim().max(1000).optional() }),
]);

const MODEL_CALLING = new Set(["another_round", "challenge", "direct"]);

export const POST = route<IdCtx>(
  async (req, ctx, db) => {
    const { id } = await ctx.params;
    const action = await body(req, actionSchema);
    if (MODEL_CALLING.has(action.type) && !take("local:expensive", RULES.expensive).ok) {
      throw new HttpError(429, "Too many model-calling actions — wait a moment.");
    }
    const result = await applyAction(db, id, action);
    if (!result.ok) throw new HttpError(result.status, result.error);
    return json(result);
  },
  { rate: "write" },
);
