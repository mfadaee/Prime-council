/**
 * Beyond the System — outcome evaluation against the current system.
 *
 * For each case in evals/beyond/cases.json the council answers twice with the
 * configured real models: once in standard mode (the baseline) and once in
 * Beyond-the-System mode. Each run is scored with deterministic checks and the
 * outcome metrics from src/lib/council/beyond.ts; a JSON report is written to
 * evals/beyond/results/. Skips (never fakes results) when no real model is seated.
 *
 *   BEYOND_EVAL=1 npm run eval:beyond
 *
 * Spending is bounded by the normal per-session and daily budgets in Settings.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/db/client";
import { councilSessions, members, providers } from "@/lib/db/schema";
import { buildBeyondView, compareToBaseline, outcomeMetrics, standardMetrics, tokens } from "@/lib/council/beyond";
import { buildRoster, loadState, startSession } from "@/lib/council/service";
import { ensureSeeded } from "@/lib/council/seed";
import type { MemberProfile } from "@/lib/council/types";

interface Case {
  id: string;
  question: string;
  expects: string;
  checks: { constraintMentions?: string[]; noConstraintRemoved?: boolean; reframe?: boolean; framingMentions?: string[]; minDistinct?: number; answerContains?: string; conventionalOrNoReframe?: boolean };
}

const cases = JSON.parse(readFileSync(path.join(process.cwd(), "evals/beyond/cases.json"), "utf8")) as Case[];
const enabled = process.env.BEYOND_EVAL === "1";
const hits = (text: string, words: string[]) => words.filter((w) => text.toLowerCase().includes(w));

describe.skipIf(!enabled)("Beyond the System evaluation (real models)", () => {
  it("compares Beyond-the-System sessions with standard sessions on representative cases", async () => {
    const { db, close } = await createTestDb();
    try {
      await ensureSeeded(db);
      const roster = buildRoster((await db.select().from(members).where(eq(members.enabled, true))) as MemberProfile[], await db.select().from(providers));
      if (roster.every((m) => m.simulated)) {
        console.warn("No real model is configured: nothing to evaluate (demo output is never scored).");
        return;
      }
      const report: unknown[] = [];
      for (const c of cases) {
        const runOnce = async (mode: "standard" | "beyond") => {
          const { id, run } = await startSession(db, { question: c.question, mode });
          const status = await run.done;
          const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
          return { id, status, row, state: await loadState(db, id, row) };
        };
        const base = await runOnce("standard");
        const beyond = await runOnce("beyond");
        const view = buildBeyondView({
          map: beyond.state.map,
          contributions: [...beyond.state.initial].map(([memberId, contribution]) => ({ memberId, contribution })),
          critiques: beyond.state.critiques,
          replies: beyond.state.replies,
          experiment: beyond.state.experiment,
          final: beyond.state.final,
        });
        const m = outcomeMetrics(view, beyond.state.final);
        const b = standardMetrics([...base.state.initial.values()], base.state.final);
        const constraintText = view.assumptions.filter((a) => a.kind === "constraint").map((a) => a.statement).join(" ");
        const framingText = [beyond.state.final?.framingVerdict, ...view.frameChallenges.map((f) => `${f.check.reason} ${f.check.proxyRisk ?? ""}`), ...view.alternatives.filter((a) => a.level === "reframe").map((a) => a.description)].join(" ");
        const k = c.checks;
        const findings: Record<string, boolean> = {};
        if (k.constraintMentions) findings.keptPhysicalConstraint = hits(constraintText, k.constraintMentions).length > 0;
        if (k.noConstraintRemoved) findings.noConstraintRemoved = m.constraintViolations === 0;
        if (k.reframe) findings.reframed = m.reframes > 0;
        if (k.framingMentions) findings.noticedProxy = hits(framingText, k.framingMentions).length > 0;
        if (k.minDistinct) findings.distinctAlternatives = m.distinctAlternatives >= k.minDistinct;
        if (k.answerContains) findings.correctAnswer = (beyond.state.final?.answer ?? "").includes(k.answerContains) && (base.state.final?.answer ?? "").includes(k.answerContains);
        if (k.conventionalOrNoReframe) findings.stayedStraightforward = m.conventionalIsBest || m.reframes === 0;
        report.push({
          case: c.id,
          question: c.question,
          expects: c.expects,
          sessions: { standard: base.id, beyond: beyond.id },
          status: { standard: base.status, beyond: beyond.status },
          costUsd: { standard: base.row.costUsd, beyond: beyond.row.costUsd },
          findings,
          metrics: { beyond: m, baseline: b, comparison: compareToBaseline(m, b) },
          answerOverlap: Number([...tokens(beyond.state.final?.answer ?? "")].filter((t) => tokens(base.state.final?.answer ?? "").has(t)).length),
        });
      }
      const dir = path.join(process.cwd(), "evals/beyond/results");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(file, JSON.stringify({ roster: roster.map((r) => `${r.name}:${r.providerId}/${r.model}`), report }, null, 2));
      console.log(`Report written to ${file}`);
      expect(report).toHaveLength(cases.length);
    } finally {
      await close();
    }
  });
});
