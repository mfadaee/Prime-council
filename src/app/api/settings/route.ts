import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { stopBackgroundRuns } from "@/lib/autonomy/scheduler";
import { BUILTIN_PRICES } from "@/lib/providers/pricing";
import {
  autonomySchema,
  charterSchema,
  DEFAULT_CHARTER,
  getAutonomy,
  getCharter,
  getLimits,
  getPricing,
  LIMIT_BOUNDS,
  limitsSchema,
  priceTableSchema,
  setAutonomy,
  setCharter,
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
    charter: await getCharter(db),
    defaultCharter: DEFAULT_CHARTER,
  }),
);

const putSchema = z.object({
  limits: limitsSchema.optional(),
  autonomy: autonomySchema.optional(),
  pricing: priceTableSchema.optional(),
  charter: charterSchema.optional(),
});

export const PUT = route(async (req, _ctx, db) => {
  const input = await body(req, putSchema);
  const out: Record<string, unknown> = {};
  if (input.limits) {
    if (input.limits.hardMaxRounds < input.limits.maxRounds) input.limits.hardMaxRounds = input.limits.maxRounds;
    out.limits = await setLimits(db, input.limits);
  }
  if (input.autonomy) {
    out.autonomy = await setAutonomy(db, input.autonomy);
    if (input.autonomy.globalPause || !input.autonomy.backgroundEnabled) out.stoppedBackgroundSessions = stopBackgroundRuns("Global pause");
  }
  if (input.pricing) out.pricing = await setPricing(db, input.pricing);
  if (input.charter) out.charter = await setCharter(db, input.charter);
  await audit(db, "prime", "settings.update", null, input);
  return json(out);
});
