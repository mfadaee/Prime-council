import { describe, expect, it } from "vitest";
import { createWorld, decide, parseRecommendation, step, totalCents, councilQuestion } from "@/lib/sim/engine";
import { RESOURCES, type WorldEvent, type WorldState } from "@/lib/sim/types";

function runTicks(state: WorldState, n: number) {
  const events: WorldEvent[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = step(s);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe("world engine bookkeeping", () => {
  it("is deterministic: same seed and inputs give identical states and events", () => {
    const a = runTicks(createWorld(42).state, 90);
    const b = runTicks(createWorld(42).state, 90);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    const c = runTicks(createWorld(43).state, 90);
    expect(c.state).not.toEqual(a.state);
  });

  it("step is pure: the input state is not mutated", () => {
    const s0 = createWorld(1).state;
    const copy = structuredClone(s0);
    step(s0);
    expect(s0).toEqual(copy);
  });

  it("conserves credits in the closed economy, every tick", () => {
    let s = createWorld(7).state;
    const total = totalCents(s);
    for (let i = 0; i < 150; i++) {
      s = step(s).state;
      expect(totalCents(s)).toBe(total);
    }
  });

  it("never lets money or stock go negative", () => {
    let s = createWorld(9).state;
    for (let i = 0; i < 150; i++) {
      s = step(s).state;
      expect(s.treasury.cents).toBeGreaterThanOrEqual(0);
      for (const r of RESOURCES) expect(s.treasury.stock[r]).toBeGreaterThanOrEqual(0);
      for (const inh of s.inhabitants) {
        expect(inh.cents).toBeGreaterThanOrEqual(0);
        for (const r of RESOURCES) expect(inh.inventory[r]).toBeGreaterThanOrEqual(0);
        expect(inh.energy).toBeGreaterThanOrEqual(0);
        expect(inh.energy).toBeLessThanOrEqual(100);
      }
      for (const p of s.projects) expect(p.escrowCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("restoring a snapshot and continuing reproduces the original timeline", () => {
    const mid = runTicks(createWorld(5).state, 30).state;
    const snapshot = JSON.parse(JSON.stringify(mid)) as WorldState;
    const original = runTicks(mid, 30);
    const replayed = runTicks(snapshot, 30);
    expect(replayed.state).toEqual(original.state);
  });
});

describe("first society milestone", () => {
  const { state, events } = runTicks(createWorld(42).state, 120);
  const types = new Set(events.map((e) => e.type));

  it("a small group establishes a community", () => {
    expect(events.find((e) => e.type === "tick.summary")).toBeTruthy();
    expect(state.inhabitants.length).toBeGreaterThanOrEqual(6);
  });

  it("members propose useful projects with a stated rationale", () => {
    const proposals = events.filter((e) => e.type === "project.proposed");
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of state.projects) expect(p.rationale.length).toBeGreaterThan(10);
  });

  it("allocates resources: rules approve small projects, funding moves credits into escrow", () => {
    expect(types.has("project.approved") || types.has("project.council_needed")).toBe(true);
    expect(types.has("project.funded")).toBe(true);
  });

  it("simulates work and trade", () => {
    expect(types.has("trade")).toBe(true);
    expect(state.inhabitants.some((i) => Object.keys(i.relationships).length > 0)).toBe(true);
  });

  it("completes projects that change the world", () => {
    expect(types.has("project.completed")).toBe(true);
    expect(state.built.length).toBeGreaterThan(0);
  });
});

describe("council decisions affect the world through explicit events", () => {
  function worldAwaitingCouncil() {
    let s = createWorld(42, { councilThresholdCredits: 10 }).state;
    for (let i = 0; i < 60; i++) {
      s = step(s).state;
      const p = s.projects.find((x) => x.status === "awaiting_council");
      if (p) return { s, p };
    }
    throw new Error("no project reached the council");
  }

  it("large projects wait for the council instead of being approved by rule", () => {
    const { p } = worldAwaitingCouncil();
    expect(p.status).toBe("awaiting_council");
  });

  it("an approval is recorded with its source and the project proceeds", () => {
    const { s, p } = worldAwaitingCouncil();
    const r = decide(s, p.id, "approve", { by: "council", sessionId: "ses_x", reason: "Food security first." });
    const after = r.state.projects.find((x) => x.id === p.id)!;
    expect(["approved", "active"]).toContain(after.status);
    expect(after.decidedBy).toBe("council");
    expect(after.sessionId).toBe("ses_x");
    expect(r.events[0]).toMatchObject({ type: "council.decision", data: { decision: "approve", by: "council", sessionId: "ses_x" } });
    expect(totalCents(r.state)).toBe(totalCents(s));
  });

  it("a rejection stops the project", () => {
    const { s, p } = worldAwaitingCouncil();
    const r = decide(s, p.id, "reject", { by: "prime" });
    expect(r.state.projects.find((x) => x.id === p.id)!.status).toBe("rejected");
    expect(() => decide(r.state, p.id, "approve", { by: "prime" })).toThrow();
  });

  it("parses only unambiguous council recommendations", () => {
    expect(parseRecommendation("DECISION: APPROVE — because…")).toBe("approve");
    expect(parseRecommendation("decision: reject. The cost is too high")).toBe("reject");
    expect(parseRecommendation("We lean towards approving")).toBeNull();
  });

  it("the council question labels the world as simulated and fictional", () => {
    const { s, p } = worldAwaitingCouncil();
    expect(councilQuestion(s, p)).toMatch(/Simulated world.*fictional/);
  });
});

describe("Prime-configured limits", () => {
  it("never exceeds the maximum population", () => {
    const { state } = runTicks(createWorld(3, { maxPopulation: 7 }).state, 300);
    expect(state.inhabitants.length).toBeLessThanOrEqual(7);
  });

  it("does not grow when growth is disabled", () => {
    const { state, events } = runTicks(createWorld(3, { growthEnabled: false }).state, 200);
    expect(state.inhabitants.length).toBe(6);
    expect(events.some((e) => e.type === "inhabitant.arrived")).toBe(false);
  });

  it("caps the number of organizations", () => {
    const { state } = runTicks(createWorld(3, { maxOrganizations: 0, maxPopulation: 20 }).state, 300);
    expect(state.organizations.length).toBe(0);
  });
});

describe("agents created by the Primes", () => {
  const primes = [
    { id: "aurelia", name: "Aurelia" },
    { id: "quill", name: "Quill" },
  ];

  it("records which Prime created each agent, including newcomers", () => {
    const { state, events } = runTicks(createWorld(11, { maxPopulation: 10 }, "Test", primes).state, 600);
    expect(state.inhabitants.every((i) => primes.some((p) => p.id === i.createdBy))).toBe(true);
    expect(new Set(state.inhabitants.map((i) => i.createdBy)).size).toBe(2);
    const arrival = events.find((e) => e.type === "inhabitant.arrived");
    if (arrival) expect(arrival.text).toMatch(/(Aurelia|Quill) creates a new agent/);
  });

  it("keeps relationship state bounded per agent as the world runs", () => {
    const { state } = runTicks(createWorld(12, { maxPopulation: 30 }, "Test", primes).state, 900);
    for (const i of state.inhabitants) expect(Object.keys(i.relationships).length).toBeLessThanOrEqual(12);
  });
});
