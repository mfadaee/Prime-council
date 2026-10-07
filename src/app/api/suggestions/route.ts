import { desc } from "drizzle-orm";
import { json, route } from "@/lib/api";
import { suggestions } from "@/lib/db/schema";

export const GET = route(async (_req, _ctx, db) => {
  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt)).limit(100);
  const order = { running: 0, scheduled: 1, queued: 2, done: 3, dismissed: 4 } as Record<string, number>;
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return json({ suggestions: rows });
});
