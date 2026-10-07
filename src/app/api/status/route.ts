import { json, route } from "@/lib/api";
import { databaseMode } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { members, providers } from "@/lib/db/schema";
import { dailySpend, demoForced } from "@/lib/council/service";
import { publicProvider } from "@/lib/providers/registry";
import { getAutonomy, getLimits } from "@/lib/settings";

export const GET = route(async (_req, _ctx, db) => {
  const rows = await db.select().from(providers);
  const limits = await getLimits(db);
  const autonomy = await getAutonomy(db);
  const seated = await db.select().from(members).where(eq(members.enabled, true));
  const kindById = new Map(rows.map((p) => [p.id, p.kind]));
  const simulatedSeats = demoForced() ? seated.length : seated.filter((m) => kindById.get(m.providerId) === "demo").length;
  return json({
    database: databaseMode(),
    demoForced: demoForced(),
    access: process.env.SIMLIFE_ACCESS_TOKEN ? "token" : "local-only",
    providers: rows.map(publicProvider),
    seats: { total: seated.length, simulated: simulatedSeats },
    spendTodayUsd: await dailySpend(db),
    backgroundSpendTodayUsd: await dailySpend(db, "background"),
    dailyBudgetUsd: limits.dailyBudgetUsd,
    globalPause: autonomy.globalPause,
  });
});
