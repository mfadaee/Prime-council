import { z } from "zod";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { councilSuggestions, ruleSuggestions } from "@/lib/autonomy/suggestions";
import { getAutonomy } from "@/lib/settings";

const schema = z.object({ mode: z.enum(["rules", "council"]) });

export const POST = route(
  async (req, _ctx, db) => {
    const { mode } = await body(req, schema);
    const a = await getAutonomy(db);
    if (!a.suggestionsEnabled) throw new HttpError(409, "Suggested discussions are off. Enable them in Settings → Autonomy.");
    if (mode === "rules") {
      const created = await ruleSuggestions(db, 3);
      await audit(db, "prime", "suggestions.generate", null, { mode, count: created.length });
      return json({ created: created.length, note: created.length ? null : "No new rule-based topics — add interests in Memory or complete more (non-demo) sessions." });
    }
    if (a.globalPause) throw new HttpError(409, "Autonomy is globally paused.");
    const r = await councilSuggestions(db);
    await audit(db, "prime", "suggestions.generate", null, { mode, count: r.created.length, error: r.error });
    if (r.error) throw new HttpError(422, r.error);
    return json({ created: r.created.length, note: null });
  },
  { rate: "expensive" },
);
