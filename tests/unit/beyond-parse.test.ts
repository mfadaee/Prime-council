import { describe, expect, it } from "vitest";
import { parseContribution, parseCritiques, parseExperiment, parseFinal, parseReply, parseSystemMap } from "@/lib/council/parse";

describe("BeyondTheSystem output parsing", () => {
  it("parses a legacy contribution to exactly its old shape (backward compatible)", () => {
    const r = parseContribution(JSON.stringify({ answer: "a", rationale: "r", evidence: [], assumptions: ["x"], confidence: 0.7 }));
    expect(r.warning).toBeUndefined();
    expect(r.value).toEqual({ answer: "a", rationale: "r", evidence: [], assumptions: ["x"], confidence: 0.7 });
  });

  it("keeps a frame check and drops malformed list items one by one instead of the whole contribution", () => {
    const r = parseContribution(
      JSON.stringify({
        answer: "a",
        rationale: "r",
        evidence: [],
        assumptions: [],
        confidence: 0.5,
        frameCheck: {
          challenged: true,
          reason: "the metric is a proxy",
          assumptions: [{ statement: "Speed is the goal", kind: "convention", basis: "set by the transport office", matters: true }, { kind: "constraint" }, "junk"],
          reframe: "access, not speed",
        },
        alternatives: [{ title: "Measure access", description: "d", level: "reframe", removes: ["A2"], keeps: [] }, { level: "nonsense" }, { title: "Second", level: "teleport", removes: "A1" }],
      }),
    );
    expect(r.warning).toBeUndefined();
    expect(r.value.frameCheck?.assumptions).toHaveLength(1);
    expect(r.value.frameCheck?.reframe).toBe("access, not speed");
    expect(r.value.alternatives).toHaveLength(2);
    expect(r.value.alternatives?.[1]).toMatchObject({ title: "Second", level: "implementation", removes: [] }); // bad enum coerced, bad list emptied
    expect(r.value.alternatives?.every((a) => a.id === "")).toBe(true); // ids are assigned by the orchestrator, never parsed
  });

  it("truncates long BeyondTheSystem text instead of rejecting the output", () => {
    const r = parseContribution(JSON.stringify({ answer: "a", rationale: "", evidence: [], assumptions: [], confidence: 0.5, frameCheck: { challenged: true, reason: "x".repeat(5000), assumptions: [] } }));
    expect(r.value.frameCheck?.reason.length).toBe(800);
  });

  it("parses critiques with the challenged assumption, how to settle it and the alternative", () => {
    const r = parseCritiques(
      JSON.stringify({ critiques: [{ targetMemberId: "a", claim: "c", stance: "challenge", reason: "r", assumption: "A2", resolveBy: "a pilot", alternativeId: "a#1", escapesFraming: false }], overall: "partly" }),
    );
    expect(r.value.critiques[0]).toMatchObject({ assumption: "A2", resolveBy: "a pilot", alternativeId: "a#1", escapesFraming: false });
  });

  it("parses replies with and without alternative updates", () => {
    expect(parseReply(JSON.stringify({ response: "revise", updatedAnswer: "u", reason: "r" })).value).toEqual({ response: "revise", updatedAnswer: "u", reason: "r" });
    const r = parseReply(JSON.stringify({ response: "concede", updatedAnswer: "u", reason: "r", alternativeUpdates: [{ id: "x#1", action: "withdraw", note: "n" }, { id: "x#2", action: "explode" }] }));
    expect(r.value.alternativeUpdates).toEqual([
      { id: "x#1", action: "withdraw", note: "n" },
      { id: "x#2", action: "keep", note: "" },
    ]);
  });

  it("parses a system map and falls back to plain text when it is not JSON", () => {
    const m = parseSystemMap(JSON.stringify({ restatement: "r", currentSystem: "s", assumptions: [{ statement: "Lanes are finite", kind: "constraint", basis: "physics", matters: true }, { statement: "x", kind: "magic" }] }));
    expect(m.value.assumptions.map((a) => a.kind)).toEqual(["constraint", "uncertain"]);
    expect(m.value.boundaries).toEqual([]);
    const fb = parseSystemMap("not json");
    expect(fb.warning).toBeTruthy();
    expect(fb.value.assumptions).toEqual([]);
  });

  it("treats an unparseable experiment as not justified rather than inventing one", () => {
    const fb = parseExperiment("I would run a pilot");
    expect(fb.value.justified).toBe(false);
    expect(fb.value.hypothesis).toBe("");
    const ok = parseExperiment(JSON.stringify({ justified: true, reason: "", alternativeId: "a#1", hypothesis: "h", successCriteria: ["s"], stopConditions: ["t"], reversible: true }));
    expect(ok.value).toMatchObject({ justified: true, alternativeId: "a#1", reversible: true, expectedObservations: [] });
  });

  it("parses a legacy final answer without the new fields, and a beyond answer with them", () => {
    const legacy = parseFinal(JSON.stringify({ answer: "a", keyEvidence: [], uncertainty: [], disagreements: [], deliberationEffect: "", confidence: 0.5 }));
    expect(legacy.value).toEqual({ answer: "a", keyEvidence: [], uncertainty: [], disagreements: [], deliberationEffect: "", confidence: 0.5 });
    const b = parseFinal(
      JSON.stringify({
        answer: "a",
        keyEvidence: [],
        uncertainty: [],
        disagreements: [],
        deliberationEffect: "",
        confidence: 0.5,
        learned: ["l"],
        conventionalIsBest: true,
        proposedChanges: [{ target: "security", change: "c", why: "w" }, { target: "the moon", change: "c" }],
      }),
    );
    expect(b.value.learned).toEqual(["l"]);
    expect(b.value.conventionalIsBest).toBe(true);
    expect(b.value.proposedChanges).toEqual([{ target: "security", change: "c", why: "w" }]); // unknown targets dropped
  });
});
