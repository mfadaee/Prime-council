import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { councilSessions, worldEvents } from "@/lib/db/schema";
import type { FinalAnswer } from "@/lib/council/types";
import { getWorld, WORLD_ID } from "@/lib/sim/store";
import type { WorldState } from "@/lib/sim/types";

/**
 * The Chronicle: what the Founder needs to see — major decisions and their
 * outcomes — without the conversations behind them (those stay one click away).
 */
export type ChronicleEntry =
  | {
      kind: "decision";
      at: string;
      sessionId: string;
      origin: string;
      question: string;
      summary: string;
      confidence: number | null;
      status: string;
      simulated: boolean;
      override: string | null;
    }
  | { kind: "world"; at: string; tick: number; type: string; text: string; sessionId?: string };

const MAJOR_WORLD = ["project.council_needed", "council.decision", "council.recommendation", "project.completed", "project.funded", "inhabitant.arrived", "organization.founded", "world.restored", "world.created"];

export async function chronicle(db: Db, limit = 60) {
  const sessions = await db
    .select()
    .from(councilSessions)
    .where(inArray(councilSessions.status, ["completed", "stopped", "failed"]))
    .orderBy(desc(councilSessions.startedAt))
    .limit(limit);
  const decisions: ChronicleEntry[] = sessions.map((s) => {
    const f = s.final as FinalAnswer | null;
    const o = s.override as { decision?: string } | null;
    return {
      kind: "decision",
      at: (s.endedAt ?? s.startedAt).toISOString(),
      sessionId: s.id,
      origin: s.origin,
      question: s.question.replace(/^\[Simulated world:[^\]]*\]\s*/, ""),
      summary: (f?.answer ?? s.stopReason ?? "").slice(0, 320),
      confidence: f ? f.confidence : null,
      status: s.status,
      simulated: s.simulated,
      override: o?.decision ?? null,
    };
  });

  const wev = await db
    .select()
    .from(worldEvents)
    .where(and(eq(worldEvents.worldId, WORLD_ID), inArray(worldEvents.type, MAJOR_WORLD)))
    .orderBy(desc(worldEvents.id))
    .limit(limit);
  const world: ChronicleEntry[] = wev.map((e) => {
    const p = e.payload as { text: string; data: Record<string, unknown> };
    return { kind: "world", at: e.at.toISOString(), tick: e.tick, type: e.type, text: p.text, sessionId: typeof p.data.sessionId === "string" ? p.data.sessionId : undefined };
  });

  const entries = [...decisions, ...world].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);

  const state = (await getWorld(db)).state as WorldState;
  const byPrime = new Map<string, number>();
  for (const i of state.inhabitants) byPrime.set(i.createdBy, (byPrime.get(i.createdBy) ?? 0) + 1);
  const outcomes = {
    worldName: state.name,
    day: Math.floor(state.tick / 3) + 1,
    agents: state.inhabitants.length,
    agentsByPrime: (state.primes ?? []).map((p) => ({ id: p.id, name: p.name, count: byPrime.get(p.id) ?? 0 })),
    projectsBuilt: state.built.length,
    awaitingDecision: state.projects.filter((p) => p.status === "awaiting_council").length,
    organizations: state.organizations.length,
    treasuryCredits: state.treasury.cents / 100,
    decisionsMade: sessions.filter((s) => s.status === "completed").length,
  };
  return { entries, outcomes };
}
