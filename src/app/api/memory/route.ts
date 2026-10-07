import { body, json, route } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { createMemory, listMemory, memoryCreateSchema } from "@/lib/memory/service";

export const GET = route(async (_req, _ctx, db) => json({ items: await listMemory(db) }));

export const POST = route(async (req, _ctx, db) => {
  const input = await body(req, memoryCreateSchema);
  const row = await createMemory(db, input);
  await audit(db, "prime", "memory.create", row.id, { kind: row.kind, source: row.source });
  return json(row, { status: 201 });
});
