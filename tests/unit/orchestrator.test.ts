import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { councilSessions, usageRecords } from "@/lib/db/schema";
import { events, fakeAdapter, makeRun, roster, setup, waitFor, type Call } from "./helpers";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await setup()));
afterEach(async () => close());

const ok = () => ({ kind: "ok" }) as const;

describe("council pipeline", () => {
  it("runs interpret → independent → critique → resolve → synthesize and persists the final answer", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls) });
    expect(await run.start(false)).toBe("completed");

    const ev = await events(db, id);
    const phases = ev.filter((e) => e.type === "phase.started").map((e) => (e as { phase: string }).phase);
    expect(phases[0]).toBe("interpret");
    expect(phases[1]).toBe("independent");
    expect(phases).toContain("critique");
    expect(phases.at(-1)).toBe("synthesize");
    expect(ev.at(-1)).toMatchObject({ type: "session.ended", status: "completed" });
    expect(ev.some((e) => e.type === "session.final")).toBe(true);

    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.status).toBe("completed");
    expect(row.final).toBeTruthy();
    expect(row.initialAnswer).toBeTruthy();
    // seq numbers are gap-free and ordered
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i + 1));
  });

  it("keeps initial contributions independent: no member sees another's answer before critique", async () => {
    const calls: Call[] = [];
    const { run } = await makeRun(db, {
      adapter: fakeAdapter(ok, calls, (req, memberId) =>
        req.hint?.phase === "independent"
          ? { answer: `SECRET-ANSWER-OF-${memberId}`, rationale: "r", evidence: [], assumptions: [], confidence: 0.6 }
          : fallback(req),
      ),
    });
    await run.start(false);
    const independent = calls.filter((c) => c.phase === "independent");
    expect(independent.length).toBe(3); // analyst, skeptic, builder
    for (const c of independent) expect(c.prompt).not.toMatch(/SECRET-ANSWER-OF/);
    const critique = calls.filter((c) => c.phase === "critique");
    expect(critique.length).toBeGreaterThan(0);
    for (const c of critique) {
      expect(c.prompt).toMatch(/SECRET-ANSWER-OF/);
      expect(c.prompt).not.toContain(`SECRET-ANSWER-OF-${c.memberId}`); // critiques others, not itself
    }
  });

  it("continues when one provider is unavailable and marks that member offline", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((m) => (m === "builder" ? { kind: "fail", code: "unavailable" } : { kind: "ok" }), calls);
    const { run, id } = await makeRun(db, { adapter, limits: { maxRetries: 1 } });
    expect(await run.start(false)).toBe("completed");
    const ev = await events(db, id);
    expect(ev.some((e) => e.type === "member.error" && e.memberId === "builder" && e.code === "unavailable")).toBe(true);
    expect(ev.some((e) => e.type === "member.state" && e.memberId === "builder" && e.state === "offline")).toBe(true);
    // retried exactly once (bounded), then never called again in later phases
    expect(calls.filter((c) => c.memberId === "builder").length).toBe(2);
  });

  it("retries a transient error within the retry limit and then succeeds", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((m, p) => (m === "analyst" && p === "independent" ? { kind: "fail", code: "rate_limited", times: 1 } : { kind: "ok" }), calls);
    const { run, id } = await makeRun(db, { adapter, limits: { maxRetries: 1 } });
    expect(await run.start(false)).toBe("completed");
    const ev = await events(db, id);
    expect(ev.some((e) => e.type === "member.message" && e.memberId === "analyst" && e.kind === "contribution")).toBe(true);
    expect(ev.some((e) => e.type === "member.state" && e.memberId === "analyst" && /Retrying/.test(e.detail ?? ""))).toBe(true);
  });

  it("does not retry non-retryable errors", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((m) => (m === "skeptic" ? { kind: "fail", code: "auth" } : { kind: "ok" }), calls);
    const { run } = await makeRun(db, { adapter, limits: { maxRetries: 3 } });
    await run.start(false);
    expect(calls.filter((c) => c.memberId === "skeptic").length).toBe(1);
  });

  it("fails clearly when no contributor can answer", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((m) => (m === "chair" || m === "synthesizer" ? { kind: "ok" } : { kind: "fail", code: "unavailable" }), calls);
    const { run, id } = await makeRun(db, { adapter, limits: { maxRetries: 0 } });
    expect(await run.start(false)).toBe("failed");
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.stopReason).toMatch(/No member was able to contribute/);
  });

  it("skips members whose provider is not configured without calling them", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls), unavailable: ["skeptic"] });
    expect(await run.start(false)).toBe("completed");
    expect(calls.some((c) => c.memberId === "skeptic")).toBe(false);
    const ev = await events(db, id);
    expect(ev.find((e) => e.type === "member.state" && e.memberId === "skeptic")).toMatchObject({ state: "offline" });
  });
});

describe("cancellation", () => {
  it("stop aborts in-flight provider calls and ends the session as stopped", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((_m, p) => (p === "independent" ? { kind: "hang" } : { kind: "ok" }), calls);
    const { run, id } = await makeRun(db, { adapter });
    const done = run.start(false);
    await waitFor(() => calls.filter((c) => c.phase === "independent").length === 3);
    await run.act({ type: "stop" });
    expect(await done).toBe("stopped");
    expect(calls.filter((c) => c.phase === "independent").every((c) => c.aborted)).toBe(true);
    const ev = await events(db, id);
    const stopSeq = ev.find((e) => e.type === "prime.intervention")!.seq;
    expect(ev.some((e) => e.type === "member.message" && e.seq > stopSeq)).toBe(false);
    expect(ev.some((e) => e.type === "phase.started" && (e as { phase: string }).phase === "synthesize")).toBe(false);
    const usage = await db.select().from(usageRecords).where(eq(usageRecords.sessionId, id));
    expect(usage.filter((u) => u.outcome === "cancelled").length).toBe(3);
  });

  it("excluding a member mid-call aborts only that member; the session completes without it", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((m, p) => (m === "builder" && p === "independent" ? { kind: "hang" } : { kind: "delay", ms: 5 }), calls);
    const { run, id } = await makeRun(db, { adapter });
    const done = run.start(false);
    await waitFor(() => calls.some((c) => c.memberId === "builder"));
    await run.act({ type: "exclude", memberId: "builder" });
    expect(await done).toBe("completed");
    expect(calls.find((c) => c.memberId === "builder")!.aborted).toBe(true);
    expect(calls.filter((c) => c.memberId === "builder").length).toBe(1);
    const ev = await events(db, id);
    expect(ev.some((e) => e.type === "member.message" && e.memberId === "builder")).toBe(false);
  });

  it("enforces the session wall-clock limit", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter(() => ({ kind: "hang" }), calls);
    const { run, id } = await makeRun(db, { adapter, limits: { sessionWallClockMs: 60 } });
    expect(await run.start(false)).toBe("stopped");
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.stopReason).toBe("Session time limit reached");
  });
});

describe("spending controls", () => {
  it("blocks calls whose worst-case estimate would exceed the session budget", async () => {
    const calls: Call[] = [];
    // $1000/M output → 700 max tokens ≈ $0.70 worst case per call; budget $1.
    const { run, id } = await makeRun(db, {
      adapter: fakeAdapter(ok, calls),
      price: { inputPerM: 0, outputPerM: 1000 },
      limits: { sessionBudgetUsd: 1, maxOutputTokens: 700 },
    });
    await run.start(false);
    const ev = await events(db, id);
    // Three contributors start in parallel; reservations admit only one of them.
    const blocked = ev.filter((e) => e.type === "budget.blocked");
    expect(blocked.length).toBe(2);
    expect(calls.filter((c) => c.phase === "independent").length).toBe(1);
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.costUsd).toBeLessThanOrEqual(1);
    expect(ev.some((e) => e.type === "member.state" && e.state === "blocked")).toBe(true);
  });

  it("respects the daily budget using spend from earlier sessions", async () => {
    const calls: Call[] = [];
    const { run } = await makeRun(db, {
      adapter: fakeAdapter(ok, calls),
      price: { inputPerM: 1, outputPerM: 1 },
      limits: { dailyBudgetUsd: 2 },
      dailySpent: 2,
    });
    await run.start(false);
    expect(calls.length).toBe(0);
  });

  it("refuses unpriced remote models unless explicitly allowed", async () => {
    const calls: Call[] = [];
    const { run } = await makeRun(db, { adapter: fakeAdapter(ok, calls), price: null });
    expect(await run.start(false)).toBe("failed");
    expect(calls.length).toBe(0);

    const calls2: Call[] = [];
    const { run: run2, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls2), price: null, limits: { allowUnpriced: true } });
    expect(await run2.start(false)).toBe("completed");
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.unpricedCalls).toBeGreaterThan(0);
  });

  it("records estimated cost from provider usage", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls), price: { inputPerM: 2, outputPerM: 10 } });
    await run.start(false);
    const usage = await db.select().from(usageRecords).where(eq(usageRecords.sessionId, id));
    const ok_ = usage.filter((u) => u.outcome === "ok");
    expect(ok_.length).toBe(calls.length);
    for (const u of ok_) {
      expect(u.usageSource).toBe("provider");
      expect(u.costUsd).toBeCloseTo((100 * 2 + 50 * 10) / 1e6, 10);
    }
  });
});

describe("bounded deliberation", () => {
  const alwaysChallenge = (req: import("@/lib/providers/types").GenerateRequest) => {
    if (req.hint?.phase === "critique") {
      const t = req.hint.targets![0];
      return { critiques: [{ targetMemberId: t.id, claim: "x", stance: "challenge", reason: "no" }], overall: "disagree" };
    }
    if (req.hint?.phase === "resolve") return { response: "defend", updatedAnswer: "same", reason: "still right" };
    return fallback(req);
  };

  it("never exceeds maxRounds even when members keep disagreeing", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, alwaysChallenge), limits: { maxRounds: 2, hardMaxRounds: 3 } });
    await run.start(false);
    const ev = await events(db, id);
    const critiqueRounds = new Set(ev.filter((e) => e.type === "phase.started" && (e as { phase: string }).phase === "critique").map((e) => (e as { round: number }).round));
    expect([...critiqueRounds]).toEqual([1, 2]);
  });

  it("stops after one round when nobody raises a material challenge", async () => {
    const calls: Call[] = [];
    const agree = (req: import("@/lib/providers/types").GenerateRequest) =>
      req.hint?.phase === "critique" ? { critiques: [], overall: "agree" } : fallback(req);
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, agree), limits: { maxRounds: 3 } });
    await run.start(false);
    const ev = await events(db, id);
    expect(ev.filter((e) => e.type === "phase.started" && (e as { phase: string }).phase === "critique").length).toBe(1);
    expect(ev.some((e) => e.type === "phase.started" && (e as { phase: string }).phase === "resolve")).toBe(false);
  });

  it("continues a finished session for another round but refuses beyond the hard cap", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, alwaysChallenge), limits: { maxRounds: 1, hardMaxRounds: 2 } });
    await run.start(false);
    expect(await run.continueWith({ type: "another_round" })).toBe("completed");
    expect(run.state.round).toBe(2);
    expect(await run.continueWith({ type: "another_round" })).toBe("failed");
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.stopReason).toMatch(/Round cap/);
  });

  it("drops critiques that target unknown members or the critic itself", async () => {
    const calls: Call[] = [];
    const bad = (req: import("@/lib/providers/types").GenerateRequest, memberId: string) =>
      req.hint?.phase === "critique"
        ? {
            critiques: [
              { targetMemberId: memberId, claim: "self", stance: "challenge", reason: "x" },
              { targetMemberId: "ghost", claim: "ghost", stance: "challenge", reason: "x" },
              { targetMemberId: "Analyst", claim: "by name", stance: "refine", reason: "x" },
            ],
            overall: "partly",
          }
        : fallback(req);
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, bad) });
    await run.start(false);
    const ev = await events(db, id);
    const links = ev.filter((e) => e.type === "member.link") as { from: string; to: string }[];
    expect(links.some((l) => l.from === l.to)).toBe(false);
    expect(links.some((l) => l.to === "ghost")).toBe(false);
    expect(links.some((l) => l.to === "analyst" && l.from !== "analyst")).toBe(true);
    expect(ev.some((e) => e.type === "phase.started" && (e as { phase: string }).phase === "resolve")).toBe(false);
  });
});

describe("direct address", () => {
  it("lets the Founder address one member after the session ends", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls), roster: roster(["chair", "analyst", "skeptic", "synthesizer"]) });
    await run.start(false);
    expect(await run.direct("skeptic", "What is your biggest doubt?")).toBe(true);
    const ev = await events(db, id);
    const last = ev.filter((e) => e.type === "member.message").at(-1)!;
    expect(last).toMatchObject({ memberId: "skeptic", kind: "direct" });
    expect(calls.at(-1)!.prompt).toContain("What is your biggest doubt?");
  });
});

import { demoOutput } from "@/lib/providers/adapters/demo";
function fallback(req: import("@/lib/providers/types").GenerateRequest) {
  return demoOutput(req);
}
