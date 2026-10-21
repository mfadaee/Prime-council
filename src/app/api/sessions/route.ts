import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { listSessions, startSession } from "@/lib/council/service";
import { SESSION_MODES } from "@/lib/council/types";

export const GET = route(async (_req, _ctx, db) => json({ sessions: await listSessions(db) }));

const startSchema = z.object({
  question: z.string().trim().min(3, "Ask a question of at least 3 characters").max(4000),
  mode: z.enum(SESSION_MODES).default("standard"),
});

export const POST = route(
  async (req, _ctx, db) => {
    const { question, mode } = await body(req, startSchema);
    const { id } = await startSession(db, { question, origin: "prime", mode });
    return json({ id }, { status: 201 });
  },
  { rate: "expensive" },
);
