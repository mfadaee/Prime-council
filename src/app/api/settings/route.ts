import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { BUILTIN_PRICES } from "@/lib/providers/pricing";
import {
  autonomySchema,
  getAutonomy,
  getLimits,
  getPricing,
  LIMIT_BOUNDS,
  limitsSchema,
  priceTableSchema,
  setAutonomy,
  setLimits,
  setPricing,
} from "@/lib/settings";

export const GET = route(async (_req, _ctx, db) =>
  json({
    limits: await getLimits(db),
    bounds: LIMIT_BOUNDS,
    autonomy: await getAutonomy(db),
    pricing: await getPricing(db),
    builtinPrices: BUILTIN_PRICES,
  }),
);

const putSchema = z.object({
  limits: limitsSchema.optional(),
  autonomy: autonomySchema.optional(),
  pricing: priceTableSchema.optional(),
});

export const PUT = route(async (req, _ctx, db) => {
  const input = await body(req, putSchema);
  const out: Record<string, unknown> = {};
  if (input.limits) {
    if (input.limits.hardMaxRounds < input.limits.maxRounds) input.limits.hardMaxRounds = input.limits.maxRounds;
    out.limits = await setLimits(db, input.limits);
  }
  if (input.autonomy) out.autonomy = await setAutonomy(db, input.autonomy);
  if (input.pricing) out.pricing = await setPricing(db, input.pricing);
  await audit(db, "prime", "settings.update", null, input);
  return json(out);
});
