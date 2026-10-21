import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { councilSessions, suggestions } from "@/lib/db/schema";
import { runs } from "@/lib/council/orchestrator";
import { audit, dailySpend, startSession, suggestionStartOptions } from "@/lib/council/service";
import { getAutonomy } from "@/lib/settings";
import { startOfUtcDay } from "@/lib/util";
import { getWorld, requestCouncil } from "@/lib/sim/store";
import type { WorldState } from "@/lib/sim/types";
import { queueSelfExamination, ruleSuggestions } from "./suggestions";

/**
 * Background activity scheduler (opt-in, bounded, pausable).
 *
 * Every tick it may:
 *  1. top up the suggestion queue with free rule-based suggestions (if enabled);
 *  2. start ONE background session for the oldest suggestion the Founder marked
 *     "scheduled" — only if background sessions are enabled, nothing is paused,
 *     the per-day count and background budget allow it, and the interval elapsed.
 * Background sessions run with one critique round and the background budget.
 */
export type TickOutcome =
  | "paused"
  | "disabled"
  | "busy"
  | "daily-cap"
  | "budget"
  | "waiting"
  | "nothing-scheduled"
  | "started"
  | "governance-started";

export interface SchedulerStatus {
  active: boolean;
  lastTickAt: string | null;
  lastOutcome: TickOutcome | null;
  lastStartedSessionId: string | null;
}

const g = globalThis as unknown as { __simlifeScheduler?: { timer?: ReturnType<typeof setInterval>; status: SchedulerStatus } };
const state = (g.__simlifeScheduler ??= { status: { active: false, lastTickAt: null, lastOutcome: null, lastStartedSessionId: null } });

export function schedulerStatus(): SchedulerStatus {
  return { ...state.status };
}

export function backgroundRunning(): boolean {
  for (const r of runs.values()) if (r.running && r.scope === "background") return true;
  return false;
}

/** Cancel every running background session (global pause). Returns how many were stopped. */
export function stopBackgroundRuns(reason: string): number {
  let n = 0;
  for (const r of runs.values()) {
    if (r.running && r.scope === "background") {
      r.cancel(reason);
      n++;
    }
  }
  return n;
}

export async function tick(db: Db, now = new Date()): Promise<{ outcome: TickOutcome; sessionId?: string }> {
  const a = await getAutonomy(db);
  state.status.lastTickAt = now.toISOString();
  const done = (outcome: TickOutcome, sessionId?: string) => {
    state.status.lastOutcome = outcome;
    if (sessionId) state.status.lastStartedSessionId = sessionId;
    return { outcome, sessionId };
  };
  if (a.globalPause) return done("paused");
  if (a.suggestionsEnabled) await ruleSuggestions(db, 2);
  if (!a.backgroundEnabled && !a.primeGovernance) return done("disabled");
  if (backgroundRunning()) return done("busy");

  const today = await db
    .select({ id: councilSessions.id, startedAt: councilSessions.startedAt })
    .from(councilSessions)
    .where(and(inArray(councilSessions.origin, ["background", "governance"]), gte(councilSessions.startedAt, startOfUtcDay(now))))
    .orderBy(desc(councilSessions.startedAt));
  if (today.length >= a.maxSessionsPerDay) return done("daily-cap");
  // A $0 budget still allows free (local/demo) sessions; the budget guard refuses priced calls.
  if (a.backgroundDailyBudgetUsd > 0 && (await dailySpend(db, "background")) >= a.backgroundDailyBudgetUsd) return done("budget");

  // Prime governance: the Primes take up the oldest world decision nobody has deliberated yet.
  if (a.primeGovernance) {
    const world = (await getWorld(db)).state as WorldState;
    const pending = world.projects.find((p) => p.status === "awaiting_council" && !p.sessionId);
    if (pending) {
      const sessionId = await requestCouncil(db, pending.id, { automated: true });
      return done("governance-started", sessionId);
    }
  }
  if (!a.backgroundEnabled) return done("nothing-scheduled");
  const [last] = await db
    .select({ startedAt: councilSessions.startedAt })
    .from(councilSessions)
    .where(eq(councilSessions.origin, "background"))
    .orderBy(desc(councilSessions.startedAt))
    .limit(1);
  if (last && now.getTime() - last.startedAt.getTime() < a.intervalMinutes * 60_000) return done("waiting");

  if (a.selfExaminationDays > 0) await queueSelfExamination(db, a.selfExaminationDays, now);
  const [next] = await db.select().from(suggestions).where(eq(suggestions.status, "scheduled")).orderBy(asc(suggestions.createdAt)).limit(1);
  if (!next) return done("nothing-scheduled");

  const { id, run } = await startSession(db, { question: next.question, origin: "background", limitsOverride: { maxRounds: 1, hardMaxRounds: 1 }, ...suggestionStartOptions(next) });
  await db.update(suggestions).set({ status: "running", sessionId: id }).where(eq(suggestions.id, next.id));
  await audit(db, "scheduler", "background.start", id, { suggestionId: next.id });
  void run.done.then(async (status) => {
    await db.update(suggestions).set({ status: status === "completed" ? "done" : "scheduled" }).where(eq(suggestions.id, next.id));
  });
  return done("started", id);
}

/** Start the in-process scheduler once per server (no-op if already running). */
export function startScheduler(intervalMs = 60_000): void {
  if (state.timer) return;
  state.status.active = true;
  const run = async () => {
    try {
      await tick(await getDb());
    } catch (err) {
      console.error("[scheduler]", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(run, 10_000);
  state.timer = setInterval(run, intervalMs);
  state.timer.unref?.();
}
