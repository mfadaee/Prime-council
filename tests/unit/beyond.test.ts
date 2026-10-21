import { describe, expect, it } from "vitest";
import {
  buildBeyondView,
  changePolicy,
  compareToBaseline,
  constraintViolations,
  describeCouncil,
  distinctGroups,
  outcomeMetrics,
  relatedDiscoveries,
  revisitContext,
  sanitizeAlternatives,
  standardMetrics,
  withAssumptionIds,
  type BeyondInput,
} from "@/lib/council/beyond";
import { CHANGE_TARGETS, DEFAULT_LIMITS, type Alternative, type Contribution, type FinalAnswer, type SystemMap } from "@/lib/council/types";

/** A commute problem: one physical constraint, one human convention, one untested belief. */
const MAP: SystemMap = withAssumptionIds({
  restatement: "Reduce rush-hour congestion",
  constraints: ["Road capacity per lane is finite"],
  successCriteria: [],
  currentSystem: "Most workers drive to central offices for a 9am start",
  produces: "Peak-hour congestion",
  whyExists: "Industrial-era schedules",
  assumptions: [
    { statement: "A lane can only carry a finite number of vehicles per hour", kind: "constraint", layer: "reality", basis: "Traffic flow physics", matters: true },
    { statement: "Everyone must start work at 9am", kind: "convention", layer: "constructed", basis: "Custom, not law", matters: true },
    { statement: "Work requires being physically in the office", kind: "uncertain", layer: "assumption", basis: "Untested for most roles", matters: true },
  ],
  boundaries: ["Not travelling at all"],
  distortions: ["Success is measured as traffic speed rather than access"],
});

const raw = (title: string, level: Alternative["level"], removes: string[], description = `${title} description`): Omit<Alternative, "id"> => ({ title, description, level, removes, keeps: [] });
const contribution = (alternatives: Alternative[], extra: Partial<Contribution> = {}): Contribution => ({ answer: "a", rationale: "", evidence: [], assumptions: [], confidence: 0.5, alternatives, ...extra });
const final = (over: Partial<FinalAnswer> = {}): FinalAnswer => ({ answer: "f", keyEvidence: [], uncertainty: [], disagreements: [], deliberationEffect: "", confidence: 0.5, ...over });

function input(over: Partial<BeyondInput> = {}): BeyondInput {
  return {
    map: MAP,
    contributions: [
      { memberId: "analyst", contribution: contribution(sanitizeAlternatives([raw("Stagger start times across the morning", "implementation", ["A2"])], "analyst", MAP)) },
      { memberId: "builder", contribution: contribution(sanitizeAlternatives([raw("Neighbourhood work hubs", "redesign", ["A3"], "Shared offices within walking distance of home")], "builder", MAP)) },
      {
        memberId: "skeptic",
        contribution: contribution(sanitizeAlternatives([raw("Measure access to jobs, not traffic speed", "reframe", ["A2", "A3"], "Change the objective: people need access, not faster cars")], "skeptic", MAP)),
      },
    ],
    critiques: [],
    replies: [],
    experiment: null,
    final: null,
    ...over,
  };
}

describe("assumption identification", () => {
  it("assigns assumption ids in code and keeps their classification", () => {
    expect(MAP.assumptions.map((a) => [a.id, a.kind])).toEqual([
      ["A1", "constraint"],
      ["A2", "convention"],
      ["A3", "uncertain"],
    ]);
  });

  it("distinguishes a physical constraint from a human convention: removing the constraint is flagged, removing the convention is not", () => {
    const alts = sanitizeAlternatives([raw("Ignore lane capacity", "redesign", ["A1"]), raw("Flexible hours", "implementation", ["A2"])], "analyst", MAP);
    expect(constraintViolations(alts, MAP)).toEqual([{ alternativeId: "analyst#1", assumptionId: "A1", statement: MAP.assumptions[0].statement }]);

    const view = buildBeyondView(input({ contributions: [{ memberId: "analyst", contribution: contribution(alts) }] }));
    expect(view.alternatives[0].flags.join(" ")).toMatch(/fundamental constraint/);
    expect(view.alternatives[1].flags).toEqual([]);
    expect(view.checks.find((c) => c.id === "no_constraint_removed")?.status).toBe("attention");
  });

  it("flags a map that treats everything as arbitrary", () => {
    const allConventions = withAssumptionIds({ ...MAP, assumptions: MAP.assumptions.map((a) => ({ ...a, kind: "convention" as const })) });
    const view = buildBeyondView(input({ map: allConventions }));
    const check = view.checks.find((c) => c.id === "constraint_vs_convention")!;
    expect(check.status).toBe("attention");
    expect(check.detail).toMatch(/real limits were not dismissed/);
  });

  it("records a member reclassifying a mapped assumption as a challenge to it", () => {
    const fc = { challenged: true, reason: "the start time is set by contracts", assumptions: [{ statement: "Everyone must start work at 9am", kind: "constraint" as const, basis: "union contracts", matters: true }] };
    const view = buildBeyondView(input({ contributions: [{ memberId: "researcher", contribution: contribution([], { frameCheck: fc }) }] }));
    const a2 = view.assumptions.find((a) => a.id === "A2")!;
    expect(a2.challengedBy).toEqual([{ memberId: "researcher", note: expect.stringContaining("fundamental constraint") }]);
    expect(view.frameChallenges).toHaveLength(1);
  });
});

describe("alternative generation", () => {
  it("ignores model-supplied ids, drops unknown assumption references and caps each member at three", () => {
    const alts = sanitizeAlternatives(
      [
        { ...raw("One", "implementation", ["a2", "A9", "A2"]), id: "evil#99" } as Alternative,
        raw("Two", "redesign", []),
        raw("Three", "reframe", []),
        raw("Four", "reframe", []),
        raw(" ", "reframe", []),
      ],
      "builder",
      MAP,
    );
    expect(alts.map((a) => a.id)).toEqual(["builder#1", "builder#2", "builder#3"]);
    expect(alts[0].removes).toEqual(["A2"]);
  });

  it("counts superficial variations of the same idea once", () => {
    const alts = sanitizeAlternatives(
      [raw("Stagger office start times", "implementation", ["A2"], "Spread start times across the morning to flatten the peak"), raw("Staggered start times", "implementation", ["A2"], "Spread office start times across the morning to flatten peak traffic")],
      "analyst",
      MAP,
    );
    expect(distinctGroups(alts)).toEqual([["analyst#1", "analyst#2"]]);
    const view = buildBeyondView(input({ contributions: [{ memberId: "analyst", contribution: contribution(alts) }] }));
    expect(view.alternatives[1].duplicateOf).toBe("analyst#1");
    expect(view.viableDistinct).toBe(1);
  });

  it("passes when there are three viable, structurally different alternatives including a reframe", () => {
    const view = buildBeyondView(input());
    expect(view.viableDistinct).toBe(3);
    expect(view.checks.find((c) => c.id === "distinct_alternatives")?.status).toBe("pass");
    expect(view.checks.find((c) => c.id === "reframe_present")?.status).toBe("pass");
  });

  it("asks for attention when every alternative only improves the current solution", () => {
    const only = sanitizeAlternatives([raw("Better signals", "implementation", []), raw("More buses", "implementation", [], "Increase bus frequency on main routes")], "analyst", MAP);
    const view = buildBeyondView(input({ contributions: [{ memberId: "analyst", contribution: contribution(only) }] }));
    expect(view.checks.find((c) => c.id === "reframe_present")?.status).toBe("attention");
  });

  it("does not count a withdrawn or constraint-violating idea toward the distinct alternatives", () => {
    const alts = sanitizeAlternatives([raw("Ignore lane capacity", "redesign", ["A1"]), raw("Flexible hours", "implementation", ["A2"])], "analyst", MAP);
    const view = buildBeyondView(input({ contributions: [{ memberId: "analyst", contribution: contribution(alts) }] }));
    expect(view.distinctCount).toBe(2);
    expect(view.viableDistinct).toBe(1);
  });
});

describe("recognising when challenging assumptions is unnecessary", () => {
  it("accepts a conclusion that the conventional approach is best without demanding a reframe", () => {
    const one = sanitizeAlternatives([raw("Keep the current schedule", "implementation", [])], "analyst", MAP);
    const view = buildBeyondView(input({ contributions: [{ memberId: "analyst", contribution: contribution(one) }], final: final({ conventionalIsBest: true }) }));
    expect(view.checks.find((c) => c.id === "distinct_alternatives")?.status).toBe("pass");
    expect(view.checks.find((c) => c.id === "reframe_present")?.status).toBe("not_applicable");
  });

  it("accepts an explained decision that no experiment is justified", () => {
    const plan = { justified: false, reason: "Existing evidence already settles it", alternativeId: null, hypothesis: "", expectedObservations: [], cost: "", risks: [], successCriteria: [], stopConditions: [], reversible: false };
    const view = buildBeyondView(input({ experiment: { memberId: "builder", plan } }));
    expect(view.checks.find((c) => c.id === "falsifiable_experiment")?.status).toBe("pass");
  });

  it("standard sessions with no frame checks report no assumptions challenged", () => {
    expect(standardMetrics([contribution([])], final()).materialAssumptions).toBe(0);
  });
});

describe("disagreement", () => {
  const critique = (from: string, target: string, stance: "challenge" | "support" | "refine", extra: Record<string, unknown> = {}) => ({
    from,
    round: 1,
    set: { overall: "partly" as const, critiques: [{ targetMemberId: target, claim: "c", stance, reason: `${from} on ${target}`, ...extra }] },
  });

  it("attributes support and challenge to the alternative and keeps the challenged assumption and how to settle it", () => {
    const view = buildBeyondView(
      input({
        critiques: [critique("builder", "skeptic", "challenge", { alternativeId: "skeptic#1", assumption: "A3", resolveBy: "a two-week pilot", escapesFraming: true }), critique("analyst", "skeptic", "support", { alternativeId: "skeptic#1" })],
      }),
    );
    const alt = view.alternatives.find((a) => a.id === "skeptic#1")!;
    expect(alt.originatorId).toBe("skeptic");
    expect(alt.challengers).toEqual([expect.objectContaining({ memberId: "builder", assumption: "A3", resolveBy: "a two-week pilot" })]);
    expect(alt.supporters.map((s) => s.memberId)).toEqual(["analyst"]);
    expect(alt.escapes).toEqual({ yes: 1, no: 0 });
    expect(view.assumptions.find((a) => a.id === "A3")!.challengedBy.map((c) => c.memberId)).toEqual(["builder"]);
  });

  it("ignores an alternative reference that does not belong to the member being critiqued", () => {
    const view = buildBeyondView(input({ critiques: [critique("builder", "analyst", "challenge", { alternativeId: "skeptic#1" })] }));
    expect(view.alternatives.find((a) => a.id === "skeptic#1")!.challengers).toEqual([]);
    expect(view.alternatives.find((a) => a.id === "analyst#1")!.challengers).toHaveLength(1); // the target's only alternative
  });

  it("only lets an originator withdraw its own alternative, and keeps withdrawn ideas on record", () => {
    const view = buildBeyondView(
      input({
        replies: [
          { member: "builder", round: 1, reply: { response: "concede", updatedAnswer: "", reason: "", alternativeUpdates: [{ id: "skeptic#1", action: "withdraw", note: "not mine" }] } },
          { member: "analyst", round: 1, reply: { response: "concede", updatedAnswer: "", reason: "", alternativeUpdates: [{ id: "analyst#1", action: "withdraw", note: "peak just moves" }] } },
        ],
      }),
    );
    expect(view.alternatives.find((a) => a.id === "skeptic#1")!.status).toBe("standing");
    const withdrawn = view.alternatives.find((a) => a.id === "analyst#1")!;
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.history.at(-1)!.text).toMatch(/peak just moves/);
  });

  it("asks for attention when a contested idea leaves no minority view in the final answer", () => {
    const contested = input({ critiques: [critique("builder", "skeptic", "challenge", { alternativeId: "skeptic#1" }), critique("analyst", "skeptic", "support", { alternativeId: "skeptic#1" })] });
    expect(buildBeyondView({ ...contested, final: final() }).checks.find((c) => c.id === "minority_retained")?.status).toBe("attention");
    expect(buildBeyondView({ ...contested, final: final({ minorityViews: ["Access metric deserves a pilot"] }) }).checks.find((c) => c.id === "minority_retained")?.status).toBe("pass");
  });
});

describe("experiments and outcomes", () => {
  it("requires a hypothesis, success criteria, stop conditions and reversibility", () => {
    const plan = { justified: true, reason: "", alternativeId: "skeptic#1", hypothesis: "Access improves", expectedObservations: [], cost: "low", risks: [], successCriteria: ["20% more jobs reachable"], stopConditions: [], reversible: true };
    const check = buildBeyondView(input({ experiment: { memberId: "builder", plan } })).checks.find((c) => c.id === "falsifiable_experiment")!;
    expect(check.status).toBe("attention");
    expect(check.detail).toMatch(/stop conditions/);
  });

  it("reports outcome metrics and compares them with a standard-session baseline (counts are reported, not scored)", () => {
    const view = buildBeyondView(input());
    const m = outcomeMetrics(view, final());
    expect(m).toMatchObject({ materialAssumptions: 3, conventionsIdentified: 2, distinctAlternatives: 3, reframes: 1, constraintViolations: 0 });
    const baseline = standardMetrics([contribution([], { answer: "Add a lane" }), contribution([], { answer: "Add a lane to the motorway" })], final());
    const cmp = compareToBaseline(m, baseline);
    expect(cmp.find((c) => c.metric === "reframes")).toMatchObject({ beyond: 1, baseline: 0, better: true });
    expect(cmp.find((c) => c.metric === "conventionalIsBest")?.better).toBeNull();
    expect(view.checks.every((c) => ["pass", "attention", "not_applicable"].includes(c.status))).toBe(true);
    expect(Object.keys(view)).not.toContain("score");
  });
});

describe("memory and linking", () => {
  it("links investigations in different domains that rest on the same assumption", () => {
    const related = relatedDiscoveries(
      { id: "d1", question: "Commuting", assumptions: [{ statement: "Everyone must start work at 9am" }] },
      [
        { id: "d2", question: "School timetables", assumptions: [{ statement: "Every student must start school at 8am" }] },
        { id: "d3", question: "Unrelated", assumptions: [{ statement: "Batteries degrade with charge cycles" }] },
      ],
      0.2,
    );
    expect(related.map((r) => r.id)).toEqual(["d2"]);
  });

  it("summarises an earlier investigation for a revisit, including results and lessons", () => {
    const text = revisitContext({
      question: "Commuting",
      createdAt: "2026-07-01T00:00:00Z",
      assumptions: [{ id: "A2", statement: "Everyone must start at 9am", kind: "convention", status: "refuted" }],
      alternatives: [{ id: "skeptic#1", title: "Measure access", level: "reframe", status: "standing" }],
      experiment: { status: "completed", plan: { hypothesis: "Access improves" }, result: { outcome: "supported", observations: "18% more jobs reachable" } },
      lessons: ["Start time is a convention here"],
    });
    expect(text).toContain("2026-07-01");
    expect(text).toContain("refuted");
    expect(text).toContain("18% more jobs reachable");
    expect(text).toContain("Start time is a convention here");
  });

  it("describes the council factually from its live configuration for self-examination", () => {
    const text = describeCouncil([{ name: "Lumen", role: "researcher", enabled: true, simulated: false, providerId: "anthropic", model: "m" }], DEFAULT_LIMITS);
    expect(text).toContain("Lumen (researcher)");
    expect(text).toContain(`hard cap ${DEFAULT_LIMITS.hardMaxRounds}`);
    expect(text).toMatch(/never applies them/);
  });
});

describe("safe self-improvement", () => {
  it("never auto-applies a proposed change and always requires approval, tests and review", () => {
    for (const target of CHANGE_TARGETS) {
      const p = changePolicy(target);
      expect(p.autoApply).toBe(false);
      expect(p.requires.join(" ")).toMatch(/Founder approval/);
      expect(p.requires.join(" ")).toMatch(/pull request/);
    }
    expect(changePolicy("security").sensitive).toBe(true);
    expect(changePolicy("limits").sensitive).toBe(true);
    expect(changePolicy("prompts").sensitive).toBe(false);
  });
});
