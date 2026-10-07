import { body, HttpError, json, route } from "@/lib/api";
import { providers } from "@/lib/db/schema";
import { audit } from "@/lib/council/service";
import { publicProvider } from "@/lib/providers/registry";
import { providerInput } from "@/lib/providers/schema";

export const GET = route(async (_req, _ctx, db) => {
  const rows = await db.select().from(providers);
  return json({ providers: rows.map(publicProvider) });
});

export const POST = route(async (req, _ctx, db) => {
  const input = await body(req, providerInput);
  const [row] = await db
    .insert(providers)
    .values({ ...input, baseUrl: input.baseUrl ?? null, apiKeyEnv: input.apiKeyEnv ?? null })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new HttpError(409, "A provider with that id already exists");
  await audit(db, "prime", "provider.create", row.id, { kind: row.kind, baseUrl: row.baseUrl, apiKeyEnv: row.apiKeyEnv });
  return json(publicProvider(row), { status: 201 });
});
