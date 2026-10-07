/**
 * Council orchestration engine.
 *
 * A session runs a bounded pipeline:
 *   1. interpret    – the Chair restates the request, constraints and success criteria
 *   2. independent  – contributing members answer in parallel, blind to each other
 *   3. critique     – each member reviews the others' published contributions
 *   4. resolve      – challenged members revise, defend or concede
 *      (3–4 repeat only while material challenges remain, up to the round limit)
 *   5. synthesize   – the Synthesizer writes the final answer
 *
 * Every step emits persisted events (the UI animates only these). Limits on
 * rounds, concurrency, tokens, time, retries and spend are enforced here, in
 * code — nothing a model writes can change them.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { contributions as contributionsTable, councilSessions, sessionEvents, usageRecords } from "@/lib/db/schema";
import { costUsd, estimateTokens, type Price } from "@/lib/providers/pricing";
import { ProviderError, type GenerateRequest, type ProviderAdapter, type ResolvedProvider } from "@/lib/providers/types";
import { newId } from "@/lib/util";
import { BudgetGuard, Semaphore, type BudgetLimits } from "./budget";
import { publish } from "./bus";
import {
  parseContribution,
  parseCritiques,
  parseDirect,
  parseFinal,
  parseInterpretation,
  parseReply,
  type Parsed,
} from "./parse";
import {
  critiquePrompt,
  directPrompt,
  independentPrompt,
  interpretPrompt,
  resolvePrompt,
  synthesizePrompt,
  systemPrompt,
} from "./prompts";
import { ROLES } from "./roles";
import type {
  Contribution,
  CouncilEvent,
  CritiqueSet,
  FinalAnswer,
  Interpretation,
  Limits,
  MemberState,
  MessageKind,
  Phase,
  PrimeAction,
  Reply,
  RosterEntry,
  SessionStatus,
  StoredEvent,
  UsageInfo,
} from "./types";

export interface ResolvedMember {
  adapter: ProviderAdapter;
  provider: ResolvedProvider;
  price: Price | null;
}

export interface OrchestratorDeps {
  db: Db;
  /** Resolve a roster member to a callable adapter, or a reason it is unavailable. */
  resolve: (m: RosterEntry) => ResolvedMember | { unavailable: string };
  scope?: "council" | "background";
  /** Test hook: time source. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface SessionState {
  interpretation: Interpretation | null;
  latest: Map<string, Contribution>;
  initial: Map<string, Contribution>;
  critiques: { from: string; round: number; set: CritiqueSet }[];
  replies: { member: string; round: number; reply: Reply }[];
  round: number;
  final: FinalAnswer | null;
  initialAnswer: Contribution | null;
}

export function emptyState(): SessionState {
  return { interpretation: null, latest: new Map(), initial: new Map(), critiques: [], replies: [], round: 0, final: null, initialAnswer: null };
}

/** Like Promise.all, but waits for every task to settle before rethrowing, so no
 * call is still writing when the session is finalised. */
async function settleAll(tasks: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}

class Cancelled extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Cancelled("stopped"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new Cancelled("stopped"))), { once: true });
  });

// ----------------------------------------------------------- run registry ---

/** In-memory run instances by session (running ones plus recently used idle ones). */
const g = globalThis as unknown as { __simlifeRuns?: Map<string, CouncilRun> };
export const runs: Map<string, CouncilRun> = (g.__simlifeRuns ??= new Map());

export function registerRun(run: CouncilRun): void {
  runs.delete(run.sessionId);
  runs.set(run.sessionId, run);
  // Keep the map bounded: drop the oldest idle instances.
  for (const [id, r] of runs) {
    if (runs.size <= 24) break;
    if (!r.running) runs.delete(id);
  }
}

export class CouncilRun {
  readonly sessionId: string;
  readonly question: string;
  readonly roster: RosterEntry[];
  readonly limits: Limits;
  readonly memory: string[];
  readonly excluded: Set<string>;
  readonly state: SessionState;
  private readonly deps: OrchestratorDeps;
  private readonly guard: BudgetGuard;
  private readonly sem: Semaphore;
  private readonly abort = new AbortController();
  private readonly memberAborts = new Map<string, Set<AbortController>>();
  private readonly actions: PrimeAction[] = [];
  private readonly focus: string[] = [];
  private extraRounds = 0;
  private seq: number;
  private totals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  private wallTimer?: ReturnType<typeof setTimeout>;
  private stopReason = "Stopped by the Prime";
  private readonly allSimulated: boolean;
  status: SessionStatus = "running";
  get running(): boolean {
    return this.status === "running";
  }
  get scope(): "council" | "background" {
    return this.deps.scope ?? "council";
  }
  done: Promise<SessionStatus> = Promise.resolve("running");

  constructor(opts: {
    deps: OrchestratorDeps;
    sessionId: string;
    question: string;
    roster: RosterEntry[];
    limits: Limits;
    memory: string[];
    budget: BudgetLimits;
    sessionSpent?: number;
    dailySpent: number;
    excluded?: string[];
    state?: SessionState;
    nextSeq?: number;
    totals?: { inputTokens: number; outputTokens: number; costUsd: number };
  }) {
    this.deps = opts.deps;
    this.sessionId = opts.sessionId;
    this.question = opts.question;
    this.roster = opts.roster;
    this.limits = opts.limits;
    this.memory = opts.memory;
    this.excluded = new Set(opts.excluded ?? []);
    this.state = opts.state ?? emptyState();
    this.seq = opts.nextSeq ?? 0;
    this.totals = opts.totals ?? this.totals;
    this.guard = new BudgetGuard(opts.budget, opts.sessionSpent ?? 0, opts.dailySpent);
    this.sem = new Semaphore(opts.limits.concurrency);
    this.allSimulated = opts.roster.length > 0 && opts.roster.every((m) => m.simulated);
  }

  // ------------------------------------------------------------ events ---

  private async emit(event: CouncilEvent): Promise<StoredEvent> {
    const memberId = "memberId" in event ? event.memberId : null;
    const simulated =
      event.type === "member.message"
        ? event.simulated
        : memberId
          ? Boolean(this.member(memberId)?.simulated)
          : this.allSimulated;
    const seq = ++this.seq;
    const at = new Date();
    await this.deps.db.insert(sessionEvents).values({ sessionId: this.sessionId, seq, type: event.type, payload: event, simulated, at });
    const stored = { ...event, seq, at: at.toISOString(), simulated } as StoredEvent;
    publish(this.sessionId, stored);
    return stored;
  }

  private member(id: string): RosterEntry | undefined {
    return this.roster.find((m) => m.id === id);
  }

  private setState(memberId: string, state: MemberState, detail?: string) {
    return this.emit({ type: "member.state", memberId, state, detail });
  }

  // --------------------------------------------------------- selection ---

  private active(m: RosterEntry): boolean {
    return m.enabled && !this.excluded.has(m.id) && !this.offline.has(m.id);
  }
  private readonly offline = new Map<string, string>();

  contributors(): RosterEntry[] {
    return this.roster.filter((m) => ROLES[m.role].contributes && this.active(m));
  }
  private chair(): RosterEntry | undefined {
    return this.roster.find((m) => m.role === "chair" && this.active(m));
  }
  private synthesizer(): RosterEntry | undefined {
    return (
      this.roster.find((m) => m.role === "synthesizer" && this.active(m)) ??
      this.roster.find((m) => m.role === "chair" && this.active(m)) ??
      this.contributors()[0]
    );
  }

  // ------------------------------------------------------- Prime control ---

  /** Queue a Prime action. Stop and exclude act immediately on in-flight calls. */
  async act(action: PrimeAction): Promise<void> {
    if (action.type === "stop") {
      await this.emit({ type: "prime.intervention", action: "stop", detail: {} });
      this.cancel("Stopped by the Prime");
      return;
    }
    if (action.type === "exclude") {
      this.excluded.add(action.memberId);
      for (const c of this.memberAborts.get(action.memberId) ?? []) c.abort();
      await this.emit({ type: "prime.intervention", action: "exclude", detail: { memberId: action.memberId } });
      await this.setState(action.memberId, "offline", "Excluded by the Prime");
      return;
    }
    if (action.type === "include") {
      this.excluded.delete(action.memberId);
      await this.emit({ type: "prime.intervention", action: "include", detail: { memberId: action.memberId } });
      await this.setState(action.memberId, "idle", "Re-included by the Prime");
      return;
    }
    this.actions.push(action);
  }

  cancel(reason: string): void {
    this.stopReason = reason;
    this.abort.abort();
  }

  private async checkpoint(): Promise<void> {
    if (this.abort.signal.aborted) throw new Cancelled(this.stopReason);
    while (this.actions.length) {
      const a = this.actions.shift()!;
      if (a.type === "another_round") {
        const total = this.limits.maxRounds + this.extraRounds;
        if (total < this.limits.hardMaxRounds && this.state.round + 1 <= this.limits.hardMaxRounds) {
          this.extraRounds++;
          await this.emit({ type: "prime.intervention", action: "another_round", detail: { granted: true } });
        } else {
          await this.emit({ type: "prime.intervention", action: "another_round", detail: { granted: false, reason: `Round cap (${this.limits.hardMaxRounds}) reached` } });
        }
      } else if (a.type === "challenge") {
        this.focus.push(a.claim);
        if (this.limits.maxRounds + this.extraRounds <= this.state.round && this.state.round < this.limits.hardMaxRounds) this.extraRounds++;
        await this.emit({ type: "prime.intervention", action: "challenge", detail: { claim: a.claim } });
      }
    }
  }

  // ------------------------------------------------------------ calling ---

  private async call<T>(
    m: RosterEntry,
    phase: Phase,
    round: number,
    prompt: string,
    parse: (t: string) => Parsed<T>,
    busyState: MemberState,
    targets?: RosterEntry[],
  ): Promise<{ value: T; usage: UsageInfo; durationMs: number; warning?: string } | null> {
    const resolved = this.deps.resolve(m);
    if ("unavailable" in resolved) {
      this.offline.set(m.id, resolved.unavailable);
      await this.setState(m.id, "offline", resolved.unavailable);
      return null;
    }
    const { adapter, provider, price } = resolved;
    const system = systemPrompt(m);
    const maxOut = this.limits.maxOutputTokens;
    const estIn = estimateTokens(system + prompt);
    const reservation = this.guard.reserve(costUsd(price, estIn, maxOut));
    if (!reservation.ok) {
      await this.emit({ type: "budget.blocked", memberId: m.id, reason: reservation.reason });
      await this.setState(m.id, "blocked", reservation.reason);
      return null;
    }

    const memberCtl = new AbortController();
    const set = this.memberAborts.get(m.id) ?? new Set();
    set.add(memberCtl);
    this.memberAborts.set(m.id, set);
    const signal = AbortSignal.any([this.abort.signal, memberCtl.signal]);
    const sleep = this.deps.sleep ?? defaultSleep;
    const started = Date.now();

    try {
      return await this.sem.run(async () => {
        await this.setState(m.id, busyState);
        let attempt = 0;
        for (;;) {
          if (signal.aborted) throw new ProviderError("cancelled", "Request cancelled");
          const req: GenerateRequest = {
            model: m.model,
            system,
            messages: [{ role: "user", content: prompt }],
            maxOutputTokens: maxOut,
            timeoutMs: this.limits.timeoutMs,
            signal,
            hint: { phase, role: m.role, memberName: m.name, question: this.question, targets: targets?.map((t) => ({ id: t.id, name: t.name })) },
          };
          try {
            const res = await adapter.generate(provider, req);
            const fromProvider = provider.kind !== "demo" && res.inputTokens !== null && res.outputTokens !== null;
            const inTok = res.inputTokens ?? estIn;
            const outTok = res.outputTokens ?? estimateTokens(res.text);
            const cost = costUsd(price, inTok, outTok);
            this.guard.settle(reservation.id, cost);
            await this.recordUsage(m, provider, inTok, outTok, fromProvider ? "provider" : "estimated", cost, "ok");
            if (!res.text.trim()) throw new ProviderError("bad_response", "Empty response from model");
            const parsed = parse(res.text);
            return {
              value: parsed.value,
              warning: parsed.warning,
              durationMs: Date.now() - started,
              usage: { inputTokens: inTok, outputTokens: outTok, source: fromProvider ? "provider" : "estimated", costUsd: cost },
            };
          } catch (err) {
            const pe = err instanceof ProviderError ? err : new ProviderError("unknown", err instanceof Error ? err.message : String(err));
            if (pe.code === "cancelled" || signal.aborted) throw pe;
            if (pe.retryable && attempt < this.limits.maxRetries) {
              attempt++;
              await this.setState(m.id, "preparing", `Retrying after ${pe.code} (${attempt}/${this.limits.maxRetries})`);
              await sleep(400 * 2 ** (attempt - 1), signal);
              continue;
            }
            throw pe;
          }
        }
      });
    } catch (err) {
      this.guard.release(reservation.id);
      const pe = err instanceof ProviderError ? err : err instanceof Cancelled ? new ProviderError("cancelled", err.reason) : new ProviderError("unknown", String(err));
      if (pe.code === "cancelled") {
        await this.recordUsage(m, provider, 0, 0, "estimated", 0, "cancelled");
        if (this.abort.signal.aborted) throw new Cancelled(this.stopReason);
        // Member-level cancel (excluded mid-call): the run continues without them.
        return null;
      }
      await this.recordUsage(m, provider, 0, 0, "estimated", 0, "error");
      await this.emit({ type: "member.error", memberId: m.id, phase, code: pe.code, message: pe.message, retryable: pe.retryable });
      const hard = ["unavailable", "auth", "not_configured", "timeout"].includes(pe.code);
      if (hard) this.offline.set(m.id, pe.message);
      await this.setState(m.id, pe.code === "refused" ? "blocked" : hard ? "offline" : "idle", pe.message);
      return null;
    } finally {
      set.delete(memberCtl);
    }
  }

  private async recordUsage(
    m: RosterEntry,
    p: ResolvedProvider,
    inTok: number,
    outTok: number,
    source: "provider" | "estimated",
    cost: number | null,
    outcome: string,
  ) {
    await this.deps.db.insert(usageRecords).values({
      scope: this.deps.scope ?? "council",
      sessionId: this.sessionId,
      memberId: m.id,
      providerId: p.id,
      model: m.model,
      inputTokens: inTok,
      outputTokens: outTok,
      usageSource: source,
      costUsd: cost,
      priced: cost !== null,
      outcome,
    });
    if (outcome !== "ok") return;
    this.totals.inputTokens += inTok;
    this.totals.outputTokens += outTok;
    this.totals.costUsd += cost ?? 0;
    await this.emit({ type: "usage.updated", ...this.totals, unpricedCalls: this.guard.unpricedCalls });
  }

  private async publishMessage(
    m: RosterEntry,
    kind: MessageKind,
    phase: Phase,
    round: number,
    content: unknown,
    replyTo: string[],
    r: { usage: UsageInfo; durationMs: number; warning?: string },
  ) {
    const messageId = newId("msg");
    await this.deps.db.insert(contributionsTable).values({
      id: messageId,
      sessionId: this.sessionId,
      memberId: m.id,
      round,
      phase,
      kind,
      content: content as object,
      replyTo,
      providerId: m.providerId,
      model: m.model,
      simulated: m.simulated,
    });
    await this.emit({
      type: "member.message",
      messageId,
      memberId: m.id,
      kind,
      phase,
      round,
      content,
      replyTo,
      usage: r.usage,
      durationMs: r.durationMs,
      simulated: m.simulated,
      parseWarning: r.warning,
    });
    for (const to of replyTo) await this.emit({ type: "member.link", from: m.id, to, stance: "reply" });
  }

  // ------------------------------------------------------------- phases ---

  private async phase(phase: Phase, round: number, members: RosterEntry[]) {
    await this.emit({ type: "phase.started", phase, round, memberIds: members.map((m) => m.id) });
  }

  private async interpret() {
    const chair = this.chair();
    if (!chair) return;
    await this.phase("interpret", 0, [chair]);
    const r = await this.call(chair, "interpret", 0, interpretPrompt(this.question, this.memory), parseInterpretation, "preparing");
    if (r) {
      this.state.interpretation = r.value;
      await this.setState(chair.id, "speaking");
      await this.publishMessage(chair, "interpretation", "interpret", 0, r.value, [], r);
      await this.setState(chair.id, "idle");
    }
  }

  private async independent() {
    const members = this.contributors();
    await this.phase("independent", 0, members);
    await settleAll(
      members.map(async (m) => {
        const r = await this.call(m, "independent", 0, independentPrompt(this.question, this.state.interpretation, this.memory), parseContribution, "preparing");
        if (!r) return;
        this.state.latest.set(m.id, r.value);
        this.state.initial.set(m.id, r.value);
        await this.setState(m.id, "speaking");
        await this.publishMessage(m, "contribution", "independent", 0, r.value, [], r);
        await this.setState(m.id, "idle");
      }),
    );
    const analyst = this.roster.find((m) => m.role === "analyst" && this.state.initial.has(m.id));
    const first = analyst ?? this.roster.find((m) => this.state.initial.has(m.id));
    this.state.initialAnswer = first ? this.state.initial.get(first.id)! : null;
  }

  private resolveTarget(raw: string, from: string, valid: Set<string>): string | null {
    if (valid.has(raw) && raw !== from) return raw;
    const lower = raw.toLowerCase().trim();
    const byName = this.roster.find((m) => m.id !== from && valid.has(m.id) && (m.name.toLowerCase() === lower || m.role === lower));
    return byName?.id ?? null;
  }

  private async critiqueRound(round: number, focus: string | null) {
    const members = this.contributors().filter((m) => this.state.latest.has(m.id));
    await this.phase("critique", round, members);
    const challenges: { from: RosterEntry; target: string; critique: CritiqueSet["critiques"][number] }[] = [];
    await settleAll(
      members.map(async (m) => {
        const others = members.filter((o) => o.id !== m.id).map((o) => ({ member: o, contribution: this.state.latest.get(o.id)! }));
        if (!others.length) return;
        const r = await this.call(m, "critique", round, critiquePrompt(this.question, this.state.interpretation, others, focus), parseCritiques, "reviewing", others.map((o) => o.member));
        if (!r) return;
        const valid = new Set(others.map((o) => o.member.id));
        const set: CritiqueSet = {
          overall: r.value.overall,
          critiques: r.value.critiques
            .map((c) => ({ ...c, targetMemberId: this.resolveTarget(c.targetMemberId, m.id, valid) ?? "" }))
            .filter((c) => c.targetMemberId),
        };
        this.state.critiques.push({ from: m.id, round, set });
        const isChallenging = set.critiques.some((c) => c.stance === "challenge");
        await this.setState(m.id, "speaking");
        await this.publishMessage(m, "critique", "critique", round, set, [], r);
        for (const c of set.critiques) {
          await this.emit({ type: "member.link", from: m.id, to: c.targetMemberId, stance: c.stance });
          if (c.stance === "challenge") challenges.push({ from: m, target: c.targetMemberId, critique: c });
        }
        await this.setState(m.id, isChallenging ? "challenging" : set.overall === "agree" ? "agreeing" : "idle");
      }),
    );
    return challenges;
  }

  private async resolveRound(round: number, challenges: Awaited<ReturnType<CouncilRun["critiqueRound"]>>) {
    const byTarget = new Map<string, typeof challenges>();
    for (const c of challenges) byTarget.set(c.target, [...(byTarget.get(c.target) ?? []), c]);
    const members = [...byTarget.keys()].map((id) => this.member(id)!).filter((m) => m && this.active(m) && this.state.latest.has(m.id));
    if (!members.length) return;
    await this.phase("resolve", round, members);
    await settleAll(
      members.map(async (m) => {
        const received = byTarget.get(m.id)!.map((c) => ({ from: c.from, critique: c.critique }));
        const own = this.state.latest.get(m.id)!;
        const r = await this.call(m, "resolve", round, resolvePrompt(this.question, own, received), parseReply, "preparing");
        if (!r) return;
        this.state.replies.push({ member: m.id, round, reply: r.value });
        if (r.value.response !== "defend") {
          this.state.latest.set(m.id, { ...own, answer: r.value.updatedAnswer || own.answer, rationale: r.value.reason || own.rationale });
        }
        await this.setState(m.id, "speaking");
        await this.publishMessage(m, "reply", "resolve", round, r.value, [...new Set(received.map((x) => x.from.id))], r);
        await this.setState(m.id, r.value.response === "defend" ? "challenging" : "agreeing");
      }),
    );
  }

  private async deliberate() {
    for (;;) {
      await this.checkpoint();
      const allowed = Math.min(this.limits.maxRounds + this.extraRounds, this.limits.hardMaxRounds);
      if (this.state.round >= allowed) break;
      if (this.contributors().filter((m) => this.state.latest.has(m.id)).length < 2) break;
      const round = ++this.state.round;
      const focus = this.focus.shift() ?? null;
      const challenges = await this.critiqueRound(round, focus);
      await this.checkpoint();
      if (challenges.length) await this.resolveRound(round, challenges);
      // Stop early on consensus unless the Prime explicitly asked for more.
      if (!challenges.length && !this.focus.length && this.extraRounds === 0) break;
    }
  }

  private async synthesize() {
    await this.checkpoint();
    const synth = this.synthesizer();
    const latest = this.roster.filter((m) => this.state.latest.has(m.id)).map((m) => ({ member: m, contribution: this.state.latest.get(m.id)! }));
    if (!synth || !latest.length) throw new Error("No member was able to contribute, so the council has no answer. Check provider status in Settings.");
    await this.phase("synthesize", this.state.round, [synth]);
    const critiques = this.state.critiques.map((c) => ({ from: this.member(c.from)!, set: c.set }));
    const replies = this.state.replies.map((r) => ({ member: this.member(r.member)!, reply: r.reply }));
    const r = await this.call(synth, "synthesize", this.state.round, synthesizePrompt(this.question, this.state.interpretation, latest, critiques, replies, this.memory), parseFinal, "preparing");
    if (!r) throw new Error("The synthesizer could not produce a final answer.");
    this.state.final = r.value;
    await this.setState(synth.id, "speaking");
    await this.publishMessage(synth, "synthesis", "synthesize", this.state.round, r.value, latest.map((l) => l.member.id).filter((id) => id !== synth.id), r);
    await this.emit({ type: "session.final", final: r.value, initialAnswer: this.state.initialAnswer, synthesizerId: synth.id });
    await this.setState(synth.id, "idle");
  }

  // ---------------------------------------------------------- lifecycle ---

  /** Run the full pipeline (fresh session). */
  start(simulated: boolean): Promise<SessionStatus> {
    registerRun(this);
    this.done = this.lifecycle(async () => {
      await this.emit({ type: "session.started", question: this.question, roster: this.roster, limits: this.limits, simulated });
      for (const m of this.roster) {
        if (!m.enabled) continue;
        const r = this.deps.resolve(m);
        if ("unavailable" in r) {
          this.offline.set(m.id, r.unavailable);
          await this.setState(m.id, "offline", r.unavailable);
        }
      }
      await this.checkpoint();
      await this.interpret();
      await this.checkpoint();
      if (!this.contributors().length) throw new Error("No contributing member is available. Enable a member with a working provider.");
      await this.independent();
      await this.deliberate();
      await this.synthesize();
    });
    return this.done;
  }

  /** Continue a finished session with another round or a focused challenge, then re-synthesize. */
  continueWith(action: PrimeAction): Promise<SessionStatus> {
    this.status = "running";
    registerRun(this);
    this.done = this.lifecycle(async () => {
      for (const m of this.roster) {
        const r = this.deps.resolve(m);
        if ("unavailable" in r) this.offline.set(m.id, r.unavailable);
      }
      if (action.type === "challenge") {
        this.focus.push(action.claim);
        await this.emit({ type: "prime.intervention", action: "challenge", detail: { claim: action.claim, continued: true } });
      } else {
        await this.emit({ type: "prime.intervention", action: "another_round", detail: { granted: true, continued: true } });
      }
      if (this.state.round >= this.limits.hardMaxRounds) {
        throw new Error(`Round cap (${this.limits.hardMaxRounds}) reached for this session.`);
      }
      this.extraRounds = this.state.round + 1 - this.limits.maxRounds;
      await this.deliberate();
      await this.synthesize();
    });
    return this.done;
  }

  private async lifecycle(body: () => Promise<void>): Promise<SessionStatus> {
    this.wallTimer = setTimeout(() => this.cancel("Session time limit reached"), this.limits.sessionWallClockMs);
    let status: SessionStatus = "completed";
    let reason: string | undefined;
    try {
      await body();
    } catch (err) {
      if (err instanceof Cancelled || this.abort.signal.aborted) {
        status = "stopped";
        reason = this.stopReason;
      } else {
        status = "failed";
        reason = err instanceof Error ? err.message : String(err);
      }
    } finally {
      clearTimeout(this.wallTimer);
    }
    this.status = status;
    for (const m of this.roster) {
      if (m.enabled && !this.excluded.has(m.id) && !this.offline.has(m.id)) await this.setState(m.id, "idle").catch(() => {});
    }
    await this.deps.db
      .update(councilSessions)
      .set({
        status,
        stopReason: reason ?? null,
        final: this.state.final,
        initialAnswer: this.state.initialAnswer,
        inputTokens: this.totals.inputTokens,
        outputTokens: this.totals.outputTokens,
        costUsd: this.totals.costUsd,
        unpricedCalls: this.guard.unpricedCalls,
        config: { limits: this.limits, excluded: [...this.excluded], round: this.state.round },
        endedAt: new Date(),
      })
      .where(eq(councilSessions.id, this.sessionId));
    await this.emit({ type: "session.ended", status, reason });
    return status;
  }

  /** The Prime's decision supersedes the council's (the council's answer is kept for comparison). */
  async recordOverride(decision: string, note?: string): Promise<void> {
    if (this.running) await this.done.catch(() => {});
    await this.emit({ type: "session.override", decision, note });
  }

  /** Prime addresses one member directly. Works during or after a session. */
  async direct(memberId: string, message: string): Promise<boolean> {
    const m = this.member(memberId);
    if (!m) return false;
    await this.emit({ type: "prime.intervention", action: "direct", detail: { memberId, message } });
    await this.emit({ type: "member.link", from: "prime", to: memberId, stance: "prime" });
    const history = this.state.latest.get(memberId)?.answer ?? "";
    const r = await this.call(m, "direct", this.state.round, directPrompt(this.question, this.state.final?.answer ?? null, message, history), parseDirect, "preparing").catch((e) => {
      if (e instanceof Cancelled) return null;
      throw e;
    });
    if (!r) return false;
    await this.setState(m.id, "speaking");
    await this.publishMessage(m, "direct", "direct", this.state.round, r.value, ["prime"], r);
    await this.setState(m.id, "idle");
    return true;
  }
}
