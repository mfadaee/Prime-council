import { eq } from "drizzle-orm";
import { HttpError, json, route, type IdCtx } from "@/lib/api";
import { providers } from "@/lib/db/schema";
import { checkProvider, publicProvider } from "@/lib/providers/registry";

/** Live availability check (lists models). Never spends tokens. */
export const POST = route<IdCtx>(async (_req, ctx, db) => {
  const { id } = await ctx.params;
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  if (!row) throw new HttpError(404, "Provider not found");
  return json(publicProvider(await checkProvider(db, row)));
});
