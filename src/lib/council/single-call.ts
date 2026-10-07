import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { members, providers, usageRecords } from "@/lib/db/schema";
import { costUsd, estimateTokens } from "@/lib/providers/pricing";
import { ProviderError } from "@/lib/providers/types";
import { getAutonomy, getCharter, getLimits, getPricing } from "@/lib/settings";
import { BudgetGuard } from "./budget";
import { systemPrompt } from "./prompts";
import { buildRoster, dailySpend, makeResolver } from "./service";
import type { MemberProfile, RosterEntry } from "./types";

/**
 * One bounded model call outside a council session (e.g. topic suggestions).
 * Uses the same resolver, timeout, retry-free policy and budget guard, charged
 * to the given scope.
 */
export async function singleCall(
  db: Db,
  opts: { scope: "background" | "world"; preferRoles: string[]; prompt: string; phase: string },
): Promise<{ text: string; member: RosterEntry } | { error: string }> {
  const limits = await getLimits(db);
  const autonomy = await getAutonomy(db);
  const provs = await db.select().from(providers);
  const rows = (await db.select().from(members).where(eq(members.enabled, true)).orderBy(asc(members.seat))) as MemberProfile[];
  const roster = buildRoster(rows, provs);
  const pick = opts.preferRoles.map((r) => roster.find((m) => m.role === r && !m.simulated)).find(Boolean) ?? roster.find((m) => !m.simulated);
  if (!pick) return { error: "No seat is assigned to a real model, so the council cannot propose topics (demo mode). Rule-based suggestions still work." };
  const resolved = makeResolver(provs, await getPricing(db))(pick);
  if ("unavailable" in resolved) return { error: resolved.unavailable };

  const guard = new BudgetGuard(
    {
      sessionBudgetUsd: limits.sessionBudgetUsd,
      dailyBudgetUsd: limits.dailyBudgetUsd,
      allowUnpriced: limits.allowUnpriced,
      scopeDaily: { spentUsd: await dailySpend(db, opts.scope), limitUsd: autonomy.backgroundDailyBudgetUsd, label: "Background daily" },
    },
    0,
    await dailySpend(db),
  );
  const system = systemPrompt(pick, await getCharter(db));
  const maxOut = Math.min(limits.maxOutputTokens, 800);
  const reservation = guard.reserve(costUsd(resolved.price, estimateTokens(system + opts.prompt), maxOut));
  if (!reservation.ok) return { error: reservation.reason };

  try {
    const res = await resolved.adapter.generate(resolved.provider, {
      model: pick.model,
      system,
      messages: [{ role: "user", content: opts.prompt }],
      maxOutputTokens: maxOut,
      timeoutMs: limits.timeoutMs,
      signal: AbortSignal.timeout(limits.timeoutMs + 1000),
      hint: { phase: opts.phase, role: pick.role, memberName: pick.name, question: "" },
    });
    const inTok = res.inputTokens ?? estimateTokens(system + opts.prompt);
    const outTok = res.outputTokens ?? estimateTokens(res.text);
    const cost = costUsd(resolved.price, inTok, outTok);
    await db.insert(usageRecords).values({
      scope: opts.scope,
      memberId: pick.id,
      providerId: pick.providerId,
      model: pick.model,
      inputTokens: inTok,
      outputTokens: outTok,
      usageSource: res.inputTokens !== null ? "provider" : "estimated",
      costUsd: cost,
      priced: cost !== null,
      outcome: "ok",
    });
    return { text: res.text, member: pick };
  } catch (err) {
    return { error: err instanceof ProviderError ? `${err.code}: ${err.message}` : String(err) };
  }
}
