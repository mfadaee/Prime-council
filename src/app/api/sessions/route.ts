import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { listSessions, startSession } from "@/lib/council/service";

export const GET = route(async (_req, _ctx, db) => json({ sessions: await listSessions(db) }));

const startSchema = z.object({ question: z.string().trim().min(3, "Ask a question of at least 3 characters").max(4000) });

export const POST = route(
  async (req, _ctx, db) => {
    const { question } = await body(req, startSchema);
    const { id } = await startSession(db, { question, origin: "prime" });
    return json({ id }, { status: 201 });
  },
  { rate: "expensive" },
);
