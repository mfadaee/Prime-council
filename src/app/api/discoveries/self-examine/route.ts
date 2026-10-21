import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { selfExaminationQuestion } from "@/lib/council/beyond";
import { audit, startSession } from "@/lib/council/service";
import { suggestions } from "@/lib/db/schema";
import { newId } from "@/lib/util";

const schema = z.object({
  focus: z.string().trim().max(500).optional(),
  /** Queue it as a suggestion (to discuss or schedule later) instead of convening now. */
  queue: z.boolean().default(false),
});

/**
 * Recursive self-examination: the council applies Beyond the System to itself.
 * Any change it proposes is recorded for the Founder; nothing is applied.
 */
export const POST = route(
  async (req, _ctx, db) => {
    const { focus, queue } = await body(req, schema);
    const question = selfExaminationQuestion(focus);
    if (queue) {
      const [row] = await db
        .insert(suggestions)
        .values({ id: newId("sug"), question, reason: "You asked the council to examine its own operation.", basis: [{ kind: "council", id: newId("self"), label: "How the council operates" }], proposedBy: "prime", mode: "self_examination" })
        .returning();
      await audit(db, "prime", "suggestion.self_examination", row.id, {});
      return json({ suggestionId: row.id }, { status: 201 });
    }
    const { id } = await startSession(db, { question, origin: "prime", mode: "beyond", selfExamination: true });
    return json({ sessionId: id }, { status: 201 });
  },
  { rate: "expensive" },
);
