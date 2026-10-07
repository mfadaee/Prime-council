import "server-only";
import { and, asc, desc, eq, gte, max, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLog, contributions, councilSessions, members, memoryItems, providers, sessionEvents, usageRecords } from "@/lib/db/schema";
import { priceFor, type PriceTable } from "@/lib/providers/pricing";
import { ADAPTERS, providerStatus, resolveProvider, type ProviderRow } from "@/lib/providers/registry";
import { getAutonomy, getCharter, getLimits, getPricing } from "@/lib/settings";
import { newId, startOfUtcDay } from "@/lib/util";
import { CouncilRun, emptyState, registerRun, runs, type OrchestratorDeps, type SessionState } from "./orchestrator";
import { ensureSeeded } from "./seed";
import type { Contribution, CritiqueSet, FinalAnswer, Interpretation, Limits, MemberProfile, PrimeAction, ProviderKind, Reply, RosterEntry } from "./types";

export function demoForced(): boolean {
  return process.env.SIMLIFE_DEMO === "1" || process.env.SIMLIFE_DEMO === "true";
}

export async function audit(db: Db, actor: string, action: string, target: string | null, detail: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actor, action, target, detail });
}

export async function spendSince(db: Db, since: Date, scope?: string): Promise<number> {
  const where = scope ? and(gte(usageRecords.at, since), eq(usageRecords.scope, scope)) : gte(usageRecords.at, since);
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${usageRecords.costUsd}), 0)` }).from(usageRecords).where(where);
  return Number(row?.total ?? 0);
}

export const dailySpend = (db: Db, scope?: string) => spendSince(db, startOfUtcDay(), scope);

/** Approved, enabled memory the council may use as context (bounded). */
export async function memoryContext(db: Db): Promise<string[]> {
  const rows = await db.select().from(memoryItems).where(eq(memoryItems.enabled, true)).orderBy(desc(memoryItems.updatedAt)).limit(20);
  const out: string[] = [];
  let budget = 3000;
  for (const r of rows) {
    const line = `${r.kind}: ${r.content}`.slice(0, 400);
    if (line.length > budget) break;
    budget -= line.length;
    out.push(line);
  }
  return out;
}

export function buildRoster(memberRows: MemberProfile[], providerRows: ProviderRow[]): RosterEntry[] {
  const byId = new Map(providerRows.map((p) => [p.id, p]));
  const forced = demoForced();
  const entries = memberRows.map((m) => {
    const p = byId.get(m.providerId);
    const kind = (forced ? "demo" : (p?.kind ?? "demo")) as ProviderKind;
    return {
      ...m,
      providerId: forced ? "demo" : m.providerId,
      model: forced ? "demo-simulated" : m.model,
      providerKind: kind,
      providerLabel: forced ? "Demo (SIMLIFE_DEMO)" : (p?.label ?? `Unknown provider "${m.providerId}"`),
      simulated: kind === "demo",
      sharesModelWith: [] as string[],
    };
  });
  for (const e of entries) {
    e.sharesModelWith = entries.filter((o) => o.id !== e.id && o.providerId === e.providerId && o.model === e.model).map((o) => o.id);
  }
  return entries;
}

export function makeResolver(providerRows: ProviderRow[], pricing: PriceTable): OrchestratorDeps["resolve"] {
  const byId = new Map(providerRows.map((p) => [p.id, p]));
  return (m) => {
    const row = byId.get(m.providerId);
    if (!row) return { unavailable: `Provider "${m.providerId}" does not exist` };
    const status = providerStatus(row);
    if (status === "disabled") return { unavailable: `${row.label} is disabled` };
    if (status === "not_configured") return { unavailable: `${row.label} is not configured` };
    const provider = resolveProvider(row);
    return { adapter: ADAPTERS[provider.kind], provider, price: priceFor(pricing, provider, m.model) };
  };
}

async function loadProviders(db: Db): Promise<ProviderRow[]> {
  return db.select().from(providers);
}

async function budgetFor(db: Db, limits: Limits, scope: "council" | "background") {
  const daily = await dailySpend(db);
  const budget: ConstructorParameters<typeof CouncilRun>[0]["budget"] = {
    sessionBudgetUsd: limits.sessionBudgetUsd,
    dailyBudgetUsd: limits.dailyBudgetUsd,
    allowUnpriced: limits.allowUnpriced,
  };
  if (scope === "background") {
    const a = await getAutonomy(db);
    budget.scopeDaily = { spentUsd: await dailySpend(db, "background"), limitUsd: a.backgroundDailyBudgetUsd, label: "Background daily" };
  }
  return { daily, budget };
}

export interface StartOptions {
  question: string;
  origin?: "prime" | "suggestion" | "background" | "world" | "governance";
  worldDecisionId?: string | null;
  limitsOverride?: Partial<Limits>;
}

export async function startSession(db: Db, opts: StartOptions): Promise<{ id: string; run: CouncilRun }> {
  await ensureSeeded(db);
  const scope = opts.origin === "background" || opts.origin === "governance" ? "background" : "council";
  const limits = { ...(await getLimits(db)), ...opts.limitsOverride };
  const providerRows = await loadProviders(db);
  const memberRows = (await db.select().from(members).where(eq(members.enabled, true)).orderBy(asc(members.seat))) as MemberProfile[];
  const roster = buildRoster(memberRows, providerRows);
  const pricing = await getPricing(db);
  const memory = await memoryContext(db);
  const { daily, budget } = await budgetFor(db, limits, scope);
  const id = newId("ses");
  const simulated = roster.length > 0 && roster.every((m) => m.simulated);
  await db.insert(councilSessions).values({
    id,
    question: opts.question,
    status: "running",
    origin: opts.origin ?? "prime",
    simulated,
    config: { limits, excluded: [], round: 0 },
    roster,
    worldDecisionId: opts.worldDecisionId ?? null,
  });
  await audit(db, scope === "background" ? "scheduler" : "prime", "session.start", id, { origin: opts.origin ?? "prime" });
  const run = new CouncilRun({
    deps: { db, resolve: makeResolver(providerRows, pricing), scope },
    sessionId: id,
    question: opts.question,
    roster,
    limits,
    memory,
    charter: await getCharter(db),
    budget,
    dailySpent: daily,
  });
  void run.start(simulated);
  return { id, run };
}

/** Rebuild deliberation state for a stored session (for continuation, direct messages). */
export async function loadState(db: Db, sessionId: string, row: typeof councilSessions.$inferSelect): Promise<SessionState> {
  const rows = await db.select().from(contributions).where(eq(contributions.sessionId, sessionId)).orderBy(asc(contributions.createdAt));
  const st = emptyState();
  for (const c of rows) {
    st.round = Math.max(st.round, c.round);
    if (c.kind === "interpretation") st.interpretation = c.content as Interpretation;
    else if (c.kind === "contribution") {
      st.initial.set(c.memberId, c.content as Contribution);
      st.latest.set(c.memberId, c.content as Contribution);
    } else if (c.kind === "critique") st.critiques.push({ from: c.memberId, round: c.round, set: c.content as CritiqueSet });
    else if (c.kind === "reply") {
      const reply = c.content as Reply;
      st.replies.push({ member: c.memberId, round: c.round, reply });
      const own = st.latest.get(c.memberId);
      if (own && reply.response !== "defend") st.latest.set(c.memberId, { ...own, answer: reply.updatedAnswer || own.answer });
    }
  }
  st.final = (row.final as FinalAnswer | null) ?? null;
  st.initialAnswer = (row.initialAnswer as Contribution | null) ?? null;
  return st;
}

export async function getRun(db: Db, sessionId: string): Promise<CouncilRun | null> {
  const live = runs.get(sessionId);
  if (live) return live;
  const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, sessionId));
  if (!row) return null;
  const cfg = row.config as { limits: Limits; excluded?: string[] };
  const limits = { ...(await getLimits(db)), ...cfg.limits, hardMaxRounds: cfg.limits.hardMaxRounds };
  const providerRows = await loadProviders(db);
  const pricing = await getPricing(db);
  const [{ seq }] = await db.select({ seq: max(sessionEvents.seq) }).from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
  const scope = row.origin === "background" || row.origin === "governance" ? "background" : "council";
  const { daily, budget } = await budgetFor(db, limits, scope);
  const run = new CouncilRun({
    deps: { db, resolve: makeResolver(providerRows, pricing), scope },
    sessionId,
    question: row.question,
    roster: row.roster as RosterEntry[],
    limits,
    memory: await memoryContext(db),
    charter: await getCharter(db),
    budget,
    sessionSpent: row.costUsd,
    dailySpent: daily,
    excluded: cfg.excluded,
    state: await loadState(db, sessionId, row),
    nextSeq: seq ?? 0,
    totals: { inputTokens: row.inputTokens, outputTokens: row.outputTokens, costUsd: row.costUsd },
  });
  if (row.status === "running") {
    // No live run in this process: the server restarted mid-session.
    await db.update(councilSessions).set({ status: "stopped", stopReason: "Interrupted (server restarted)", endedAt: new Date() }).where(eq(councilSessions.id, sessionId));
  }
  run.status = row.status === "running" ? "stopped" : (row.status as CouncilRun["status"]);
  registerRun(run);
  return run;
}

export type ActResult = { ok: true; note?: string } | { ok: false; error: string; status: number };

/** Apply a Founder action to a session, live or finished. */
export async function applyAction(db: Db, sessionId: string, action: PrimeAction): Promise<ActResult> {
  const run = await getRun(db, sessionId);
  if (!run) return { ok: false, error: "Session not found", status: 404 };
  const memberIds = new Set(run.roster.map((m) => m.id));
  if ("memberId" in action && !memberIds.has(action.memberId)) return { ok: false, error: "Unknown member", status: 400 };
  await audit(db, "prime", `session.${action.type}`, sessionId, { ...action });

  switch (action.type) {
    case "direct":
      void run.direct(action.memberId, action.message).catch(() => {});
      return { ok: true };
    case "override": {
      const override = { decision: action.decision, note: action.note ?? null, at: new Date().toISOString() };
      await db.update(councilSessions).set({ override }).where(eq(councilSessions.id, sessionId));
      if (run.running) await run.act({ type: "stop" });
      await run.recordOverride(action.decision, action.note);
      return { ok: true, note: "Override recorded" };
    }
    case "another_round":
    case "challenge":
      if (run.running) {
        await run.act(action);
        return { ok: true };
      }
      if (run.state.round >= run.limits.hardMaxRounds) {
        return { ok: false, error: `Round cap (${run.limits.hardMaxRounds}) reached for this session`, status: 409 };
      }
      await db.update(councilSessions).set({ status: "running", endedAt: null }).where(eq(councilSessions.id, sessionId));
      void run.continueWith(action);
      return { ok: true, note: "Continuing deliberation" };
    case "stop":
      if (!run.running) return { ok: true, note: "Session already finished" };
      await run.act(action);
      return { ok: true };
    default:
      await run.act(action);
      if (!run.running && (action.type === "exclude" || action.type === "include")) {
        const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, sessionId));
        const cfg = row.config as Record<string, unknown>;
        await db.update(councilSessions).set({ config: { ...cfg, excluded: [...run.excluded] } }).where(eq(councilSessions.id, sessionId));
      }
      return { ok: true };
  }
}

export async function listSessions(db: Db, limit = 50) {
  return db
    .select({
      id: councilSessions.id,
      question: councilSessions.question,
      status: councilSessions.status,
      origin: councilSessions.origin,
      simulated: councilSessions.simulated,
      costUsd: councilSessions.costUsd,
      inputTokens: councilSessions.inputTokens,
      outputTokens: councilSessions.outputTokens,
      startedAt: councilSessions.startedAt,
      endedAt: councilSessions.endedAt,
    })
    .from(councilSessions)
    .orderBy(desc(councilSessions.startedAt))
    .limit(limit);
}
