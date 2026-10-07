import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { reduce, reduceAll, initialChamber } from "@/lib/council/reducer";
import type { StoredEvent } from "@/lib/council/types";
import { events, fakeAdapter, makeRun, setup, type Call } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let log: StoredEvent[];
beforeAll(async () => {
  ({ db, close } = await setup());
  const calls: Call[] = [];
  const { run, id } = await makeRun(db, { adapter: fakeAdapter(() => ({ kind: "ok" }), calls) });
  await run.start(false);
  log = await events(db, id);
});
afterAll(async () => close());

describe("chamber reducer", () => {
  it("derives the final chamber state from a real session log", () => {
    const s = reduceAll(log);
    expect(s.status).toBe("completed");
    expect(s.final).not.toBeNull();
    expect(s.messages.length).toBe(log.filter((e) => e.type === "member.message").length);
    expect(Object.values(s.memberStates).every((m) => m.state === "idle")).toBe(true);
  });

  it("is idempotent: duplicated or out-of-date events are ignored", () => {
    let s = initialChamber();
    for (const e of [...log, ...log]) s = reduce(s, e);
    expect(s).toEqual(reduceAll(log));
  });

  it("replays to any point in the timeline", () => {
    const firstMsg = log.find((e) => e.type === "member.message")!;
    const s = reduceAll(log, firstMsg.seq);
    expect(s.messages.length).toBe(1);
    expect(s.speaking?.memberId).toBe((firstMsg as { memberId: string }).memberId);
    expect(s.status).toBe("running");
    expect(s.final).toBeNull();
  });

  it("only animates links from the current phase", () => {
    const synth = log.find((e) => e.type === "phase.started" && (e as { phase: string }).phase === "synthesize")!;
    const s = reduceAll(log, synth.seq);
    expect(s.links).toEqual([]);
  });
});
