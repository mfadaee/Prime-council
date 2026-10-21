import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { councilSessions, discoveries, settings, suggestions } from "@/lib/db/schema";
import { BEYOND_THE_SYSTEM } from "@/lib/council/prompts";
import { loadState } from "@/lib/council/service";
import { recordDiscovery } from "@/lib/discovery/record";
import { getDiscovery, listDiscoveries, updateDiscovery } from "@/lib/discovery/service";
import type { DiscoveryRecord } from "@/lib/discovery/types";
import { tick } from "@/lib/autonomy/scheduler";
import { ensureSeeded } from "@/lib/council/seed";
import { runs } from "@/lib/council/orchestrator";
import { DEFAULT_AUTONOMY, getLimits, setAutonomy } from "@/lib/settings";
import { demoOutput } from "@/lib/providers/adapters/demo";
import type { GenerateRequest } from "@/lib/providers/types";
import type { Contribution, CritiqueSet, ExperimentPlan, FinalAnswer, Reply, StoredEvent, SystemMap } from "@/lib/council/types";
import { events, fakeAdapter, makeRun, setup, waitFor, type Call } from "./helpers";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await setup()));
afterEach(async () => close());

const ok = () => ({ kind: "ok" }) as const;

/**
 * A scripted council exploring commuting: the builder proposes an idea that
 * removes a physical constraint, the skeptic reframes the objective, and one
 * member tries to reference and withdraw alternatives that are not its own.
 */
function scripted(req: GenerateRequest, memberId: string): unknown {
  switch (req.hint?.phase) {
    case "map":
      return {
        restatement: "Reduce rush-hour congestion",
        constraints: ["Lane capacity is finite"],
        successCriteria: ["People reach work"],
        currentSystem: "Everyone drives to a 9am start",
        produces: "Peak congestion",
        whyExists: "Industrial schedules",
        assumptions: [
          { statement: "A lane carries a finite number of vehicles per hour", kind: "constraint", basis: "traffic physics", matters: true },
          { statement: "Everyone must start work at 9am", kind: "convention", basis: "custom", matters: true },
          { statement: "Work requires presence in the office", kind: "uncertain", basis: "untested", matters: true },
        ],
        boundaries: ["Not travelling at all"],
        distortions: [],
      };
    case "independent": {
      const alt = {
        analyst: { title: "Stagger start times", level: "implementation", removes: ["A2"], description: "Spread start times across the morning" },
        skeptic: { title: "Measure access, not speed", level: "reframe", removes: ["A3"], description: "Change the goal from traffic speed to access to jobs" },
        builder: { title: "Ignore lane capacity", level: "redesign", removes: ["A1", "A99"], description: "Assume roads can carry unlimited traffic" },
      }[memberId];
      return {
        answer: `ANSWER-${memberId}`,
        rationale: "r",
        evidence: [],
        assumptions: [],
        confidence: 0.6,
        frameCheck: memberId === "skeptic" ? { challenged: true, reason: "Speed is a proxy for access", assumptions: [], reframe: "access" } : undefined,
        alternatives: alt ? [{ ...alt, id: "forged#7", keeps: [] }] : [],
      };
    }
    case "critique": {
      const critiques = {
        builder: [{ targetMemberId: "skeptic", claim: "access", stance: "challenge", reason: "hard to measure", assumption: "A3", resolveBy: "a two-week pilot", alternativeId: "skeptic#1", escapesFraming: true }],
        analyst: [{ targetMemberId: "skeptic", claim: "access", stance: "support", reason: "measures the real goal", alternativeId: "skeptic#1", escapesFraming: true }],
        skeptic: [{ targetMemberId: "builder", claim: "capacity", stance: "challenge", reason: "violates physics", alternativeId: "analyst#1" }],
      }[memberId];
      return { critiques: critiques ?? [], overall: "partly" };
    }
    case "resolve":
      return memberId === "builder"
        ? {
            response: "concede",
            updatedAnswer: "conceded",
            reason: "lanes are finite",
            alternativeUpdates: [
              { id: "builder#1", action: "withdraw", note: "violates lane capacity" },
              { id: "skeptic#1", action: "withdraw", note: "not mine to withdraw" },
            ],
          }
        : { response: "defend", updatedAnswer: "", reason: "holds" };
    case "experiment":
      return {
        justified: true,
        reason: "",
        alternativeId: "skeptic#1",
        hypothesis: "Measuring access changes which option ranks first",
        expectedObservations: ["a different ranking"],
        cost: "one week",
        risks: ["data gaps"],
        successCriteria: ["ranking changes"],
        stopConditions: ["no access data"],
        reversible: true,
      };
    case "synthesize":
      return {
        answer: "FINAL",
        keyEvidence: [],
        uncertainty: [],
        disagreements: ["The access metric is contested"],
        minorityViews: ["Staggering alone may be enough"],
        deliberationEffect: "",
        confidence: 0.6,
        learned: ["The 9am start is a convention here"],
        nextQuestions: ["How should access be measured?"],
        conventionalIsBest: false,
        framingVerdict: "Speed was a proxy",
        proposedChanges: [{ target: "security", change: "Disable the budget guard", why: "faster sessions" }],
      };
    default:
      return demoOutput(req);
  }
}

const phasesOf = (ev: StoredEvent[]) => ev.filter((e) => e.type === "phase.started").map((e) => (e as { phase: string }).phase);
const messages = (ev: StoredEvent[], kind: string) => ev.filter((e): e is Extract<StoredEvent, { type: "member.message" }> => e.type === "member.message" && e.kind === kind);

async function runBeyond(opts: { selfExamination?: boolean; context?: string } = {}) {
  const calls: Call[] = [];
  const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, scripted), mode: "beyond", ...opts });
  expect(await run.start(false)).toBe("completed");
  return { run, id, calls, ev: await events(db, id) };
}

describe("Beyond the System pipeline", () => {
  it("maps the system, generates alternatives, attacks them, designs an experiment and synthesizes", async () => {
    const { ev } = await runBeyond();
    expect(phasesOf(ev)).toEqual(["map", "independent", "critique", "resolve", "experiment", "synthesize"]);
    const [map] = messages(ev, "system_map");
    expect((map.content as SystemMap).assumptions.map((a) => a.id)).toEqual(["A1", "A2", "A3"]);
    const [exp] = messages(ev, "experiment");
    expect(exp.memberId).toBe("builder");
    expect((exp.content as ExperimentPlan).alternativeId).toBe("skeptic#1");
    expect(ev.at(-1)).toMatchObject({ type: "session.ended", status: "completed" });
    const rec = ev.findIndex((e) => e.type === "discovery.recorded");
    expect(rec).toBeGreaterThan(0);
    expect(rec).toBeLessThan(ev.length - 1);
  });

  it("assigns alternative ids and assumption references in code, never from model output", async () => {
    const { ev } = await runBeyond();
    const alts = messages(ev, "contribution").flatMap((m) => (m.content as Contribution).alternatives ?? []);
    expect(alts.map((a) => a.id).sort()).toEqual(["analyst#1", "builder#1", "skeptic#1"]);
    expect(alts.find((a) => a.id === "builder#1")!.removes).toEqual(["A1"]); // unknown "A99" dropped
  });

  it("keeps the independent phase blind: no member sees another's answer or alternatives", async () => {
    const { calls } = await runBeyond();
    const independent = calls.filter((c) => c.phase === "independent");
    expect(independent).toHaveLength(3);
    for (const c of independent) {
      expect(c.prompt).not.toMatch(/ANSWER-/);
      expect(c.prompt).not.toMatch(/Measure access|Stagger start|Ignore lane/);
      expect(c.prompt).toContain("A1 [constraint, material]"); // they do see the Chair's map
    }
  });

  it("validates disagreement: foreign alternative references are dropped and members cannot withdraw others' ideas", async () => {
    const { ev } = await runBeyond();
    const skepticCritique = messages(ev, "critique").find((m) => m.memberId === "skeptic")!.content as CritiqueSet;
    expect(skepticCritique.critiques[0].alternativeId).toBeUndefined();
    const builderReply = messages(ev, "reply").find((m) => m.memberId === "builder")!.content as Reply;
    expect(builderReply.alternativeUpdates).toEqual([{ id: "builder#1", action: "withdraw", note: "violates lane capacity" }]);
  });

  it("gives every seat the BeyondTheSystem lens in both modes", async () => {
    const { calls } = await runBeyond();
    const standard: Call[] = [];
    const { run } = await makeRun(db, { adapter: fakeAdapter(ok, standard) });
    await run.start(false);
    for (const c of [...calls, ...standard]) expect(c.system).toContain(BEYOND_THE_SYSTEM);
    expect(new Set(standard.map((c) => c.memberId))).toEqual(new Set(["chair", "analyst", "skeptic", "builder", "synthesizer"]));
  });

  it("stays proportionate in standard mode: no map, no alternatives, no experiment, no discovery", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, scripted) });
    expect(await run.start(false)).toBe("completed");
    const ev = await events(db, id);
    expect(phasesOf(ev)).not.toContain("map");
    expect(phasesOf(ev)).not.toContain("experiment");
    for (const m of messages(ev, "contribution")) expect((m.content as Contribution).alternatives).toBeUndefined();
    const final = messages(ev, "synthesis")[0].content as FinalAnswer;
    expect(final.learned).toBeUndefined();
    expect(final.proposedChanges).toBeUndefined();
    expect(await db.select().from(discoveries)).toHaveLength(0);
  });
});

describe("discovery record", () => {
  async function discovery(sessionId?: string): Promise<DiscoveryRecord> {
    const rows = await db.select().from(discoveries);
    const row = sessionId ? rows.find((r) => r.sessionId === sessionId)! : rows[0];
    return (await getDiscovery(db, row.id))!.discovery;
  }

  it("keeps every alternative with its originator, supporters and challengers — including the withdrawn one", async () => {
    const { id } = await runBeyond();
    const d = await discovery();
    expect(d.sessionId).toBe(id);
    expect(d.status).toBe("open");
    expect(d.alternatives).toHaveLength(3);
    const reframe = d.alternatives.find((a) => a.id === "skeptic#1")!;
    expect(reframe).toMatchObject({ originatorId: "skeptic", originatorName: "Skeptic", level: "reframe", status: "standing" });
    expect(reframe.challengers).toEqual([expect.objectContaining({ memberId: "builder", assumption: "A3", resolveBy: "a two-week pilot" })]);
    expect(reframe.supporters.map((s) => s.memberId)).toEqual(["analyst"]);
    const withdrawn = d.alternatives.find((a) => a.id === "builder#1")!;
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.flags.join(" ")).toMatch(/fundamental constraint/);
    expect(d.constraints).toContain("A lane carries a finite number of vehicles per hour");
    expect(d.minorityViews).toEqual(expect.arrayContaining(["Staggering alone may be enough", "The access metric is contested"]));
    expect(d.experiment).toMatchObject({ status: "proposed", designedBy: "builder", result: null });
    expect(d.lessons).toEqual(["The 9am start is a convention here"]);
    expect(d.checks.find((c) => c.id === "no_constraint_removed")?.status).toBe("attention");
  });

  it("is searchable and links investigations that share an assumption", async () => {
    const { id } = await runBeyond();
    expect((await listDiscoveries(db, "access to jobs")).length).toBe(1);
    expect(await listDiscoveries(db, "zebra crossings")).toHaveLength(0);
    expect(await listDiscoveries(db, "100%_")).toHaveLength(0); // LIKE wildcards are escaped
    const otherMap = { restatement: "School timetables", constraints: [], successCriteria: [], currentSystem: "", produces: "", whyExists: "", boundaries: [], distortions: [], assumptions: [{ id: "A1", statement: "Everyone must start school at 9am", kind: "convention" as const, basis: "", matters: true }] };
    await db.insert(councilSessions).values({ id: "ses_school", question: "School timetables", status: "completed", config: {}, roster: [] });
    await recordDiscovery(db, { sessionId: "ses_school", question: "School timetables", completed: true, scope: "question", parentId: null, simulated: false, roster: [], beyond: { map: otherMap, contributions: [], critiques: [], replies: [], experiment: null, final: null } });
    const first = await discovery(id);
    const detail = await getDiscovery(db, first.id);
    expect(detail!.related.map((r) => r.question)).toContain("School timetables");
  });

  it("preserves the Founder's experiment results and decisions when the session is continued", async () => {
    const { id } = await runBeyond();
    const d = await discovery();
    const followUp = d.followUps.find((f) => f.kind === "investigate")!;
    const updated = await updateDiscovery(db, d.id, {
      experiment: { status: "completed", result: { outcome: "supported", observations: "Ranking changed in 3 of 4 districts" } },
      assumptions: [{ id: "A2", status: "refuted", revision: "Flexible hours are already common" }],
      followUps: [{ id: followUp.id, status: "approved" }],
    });
    expect(updated!.experiment!.result).toMatchObject({ outcome: "supported", recordedAt: expect.any(String) });

    // Continuation re-synthesizes and re-records the same discovery from the rebuilt state.
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    const st = await loadState(db, id, row);
    expect(st.map?.assumptions).toHaveLength(3);
    expect(st.experiment?.plan.alternativeId).toBe("skeptic#1");
    await recordDiscovery(db, {
      sessionId: id,
      question: row.question,
      completed: true,
      scope: "question",
      parentId: null,
      simulated: false,
      roster: [],
      beyond: { map: st.map, contributions: [...st.initial].map(([memberId, contribution]) => ({ memberId, contribution })), critiques: st.critiques, replies: st.replies, experiment: st.experiment, final: st.final },
    });
    const after = await discovery();
    expect(await db.select().from(discoveries)).toHaveLength(1);
    expect(after.experiment).toMatchObject({ status: "completed", result: { outcome: "supported" } });
    expect(after.assumptions.find((a) => a.id === "A2")).toMatchObject({ status: "refuted", revision: "Flexible hours are already common" });
    expect(after.followUps.find((f) => f.id === followUp.id)?.status).toBe("approved");
  });

  it("keeps an interrupted investigation as incomplete instead of losing it", async () => {
    const calls: Call[] = [];
    const adapter = fakeAdapter((_m, p) => (p === "critique" ? { kind: "hang" } : { kind: "ok" }), calls, scripted);
    const { run } = await makeRun(db, { adapter, mode: "beyond" });
    const done = run.start(false);
    await waitFor(() => calls.some((c) => c.phase === "critique"));
    await run.act({ type: "stop" });
    expect(await done).toBe("stopped");
    const d = await discovery();
    expect(d.status).toBe("incomplete");
    expect(d.alternatives.length).toBe(3);
  });
});

describe("safe execution", () => {
  it("records proposed changes to the council for approval and applies nothing", async () => {
    const limitsBefore = await getLimits(db);
    const { run, calls } = await runBeyond({ selfExamination: true, context: "COUNCIL-DESCRIPTION" });
    expect(calls.find((c) => c.phase === "map")!.prompt).toContain("COUNCIL-DESCRIPTION");
    const [row] = await db.select().from(discoveries);
    const d = (await getDiscovery(db, row.id))!.discovery;
    expect(d.scope).toBe("council");
    const change = d.followUps.find((f) => f.kind === "process_change")!;
    expect(change).toMatchObject({ target: "security", status: "proposed", policy: { autoApply: false, sensitive: true } });
    // Nothing changed: limits, settings and the run's own budget are untouched.
    expect(await getLimits(db)).toEqual(limitsBefore);
    expect(await db.select().from(settings)).toHaveLength(0);
    expect(run.limits.sessionBudgetUsd).toBe(limitsBefore.sessionBudgetUsd);
  });

  it("drops proposed changes outside a self-examination", async () => {
    await runBeyond();
    const [row] = await db.select().from(discoveries);
    expect((await getDiscovery(db, row.id))!.discovery.followUps.some((f) => f.kind === "process_change")).toBe(false);
  });

  it("enforces the session budget in beyond mode exactly as in standard mode", async () => {
    const calls: Call[] = [];
    const { run, id } = await makeRun(db, { adapter: fakeAdapter(ok, calls, scripted), mode: "beyond", price: { inputPerM: 0, outputPerM: 1000 }, limits: { sessionBudgetUsd: 1, maxOutputTokens: 700 } });
    await run.start(false);
    const ev = await events(db, id);
    expect(ev.some((e) => e.type === "budget.blocked")).toBe(true);
    const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id));
    expect(row.costUsd).toBeLessThanOrEqual(1);
  });
});

describe("continuous improvement cycle", () => {
  it("queues a self-examination on the Founder's cadence only, and runs it through the bounded background path", async () => {
    await ensureSeeded(db);
    await setAutonomy(db, { ...DEFAULT_AUTONOMY, backgroundEnabled: true, selfExaminationDays: 0 });
    expect((await tick(db)).outcome).toBe("nothing-scheduled"); // off by default
    await setAutonomy(db, { ...DEFAULT_AUTONOMY, backgroundEnabled: true, selfExaminationDays: 7, maxSessionsPerDay: 5, intervalMinutes: 60 });
    const r = await tick(db);
    expect(r.outcome).toBe("started");
    const [s] = await db.select().from(councilSessions).where(eq(councilSessions.id, r.sessionId!));
    expect(s.origin).toBe("background");
    expect(s.config).toMatchObject({ mode: "beyond", selfExamination: true });
    await runs.get(r.sessionId!)!.done;
    expect((await tick(db, new Date(Date.now() + 61 * 60_000))).outcome).toBe("nothing-scheduled"); // one per window
    expect(await db.select().from(suggestions).where(eq(suggestions.mode, "self_examination"))).toHaveLength(1);
  }, 60_000);
});
