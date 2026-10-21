import { describe, expect, it } from "vitest";
import { buildBeyondView } from "@/lib/council/beyond";
import { beyondInput, phaseLabel, reduceAll } from "@/lib/council/reducer";
import { DEFAULT_LIMITS, type StoredEvent } from "@/lib/council/types";

const at = "2026-10-21T00:00:00.000Z";
const usage = { inputTokens: 1, outputTokens: 1, source: "estimated" as const, costUsd: 0 };
const msg = (seq: number, memberId: string, kind: string, phase: string, content: unknown): StoredEvent =>
  ({ type: "member.message", seq, at, simulated: false, messageId: `m${seq}`, memberId, kind, phase, round: phase === "critique" ? 1 : 0, content, replyTo: [], usage, durationMs: 1 }) as StoredEvent;

const log: StoredEvent[] = [
  { type: "session.started", seq: 1, at, simulated: false, question: "Q", roster: [], limits: DEFAULT_LIMITS, mode: "beyond" },
  msg(2, "chair", "system_map", "map", {
    restatement: "r", constraints: [], successCriteria: [], currentSystem: "s", produces: "", whyExists: "", boundaries: [], distortions: [],
    assumptions: [{ id: "A1", statement: "Lanes are finite", kind: "constraint", basis: "", matters: true }],
  }),
  msg(3, "analyst", "contribution", "independent", { answer: "a", rationale: "", evidence: [], assumptions: [], confidence: 0.5, alternatives: [{ id: "analyst#1", title: "T", description: "D", level: "reframe", removes: [], keeps: [] }] }),
  msg(4, "skeptic", "critique", "critique", { overall: "partly", critiques: [{ targetMemberId: "analyst", claim: "c", stance: "challenge", reason: "why", alternativeId: "analyst#1" }] }),
  { type: "discovery.recorded", seq: 5, at, simulated: false, discoveryId: "dis_1" },
];

describe("reducer: Beyond the System", () => {
  it("tracks the mode and the discovery record, and labels the new phases", () => {
    const s = reduceAll(log);
    expect(s.mode).toBe("beyond");
    expect(s.discoveryId).toBe("dis_1");
    expect(phaseLabel("map")).toBe("Mapping the current system");
    expect(phaseLabel("experiment")).toBe("Designing an experiment");
    expect(reduceAll(log.slice(0, 1).map((e) => ({ ...e, mode: undefined }) as StoredEvent)).mode).toBe("standard"); // old logs
  });

  it("derives the exploration view only from recorded messages, at any replay position", () => {
    const view = buildBeyondView(beyondInput(reduceAll(log)));
    expect(view.assumptions.map((a) => a.id)).toEqual(["A1"]);
    expect(view.alternatives[0].challengers.map((c) => c.memberId)).toEqual(["skeptic"]);
    const before = buildBeyondView(beyondInput(reduceAll(log, 3)));
    expect(before.alternatives[0].challengers).toEqual([]); // the critique had not happened yet
  });
});
