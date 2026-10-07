/**
 * Pure event → view-state reducer. The live chamber and session replay both
 * render ONLY what this derives from recorded events, so every animation on
 * screen corresponds to something the backend actually did.
 */
import type {
  Contribution,
  FinalAnswer,
  Limits,
  MemberState,
  MessageKind,
  Phase,
  RosterEntry,
  SessionStatus,
  Stance,
  StoredEvent,
  UsageInfo,
} from "./types";

export interface ChamberMessage {
  seq: number;
  at: string;
  messageId: string;
  memberId: string;
  kind: MessageKind;
  phase: Phase;
  round: number;
  content: unknown;
  replyTo: string[];
  usage: UsageInfo;
  durationMs: number;
  simulated: boolean;
  parseWarning?: string;
}

export interface SystemNote {
  seq: number;
  at: string;
  tone: "info" | "warn" | "error" | "prime";
  text: string;
  memberId?: string;
}

export interface ChamberLink {
  seq: number;
  from: string;
  to: string;
  stance: Stance | "reply" | "prime";
}

export interface ChamberState {
  question: string;
  status: SessionStatus | "idle";
  simulated: boolean;
  roster: RosterEntry[];
  limits: Limits | null;
  memberStates: Record<string, { state: MemberState; detail?: string; seq: number }>;
  phase: Phase | null;
  round: number;
  phaseSeq: number;
  messages: ChamberMessage[];
  notes: SystemNote[];
  /** Links made during the current phase (what the chamber animates). */
  links: ChamberLink[];
  speaking: { memberId: string; messageId: string; seq: number } | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number; unpricedCalls: number };
  final: FinalAnswer | null;
  initialAnswer: Contribution | null;
  synthesizerId: string | null;
  override: { decision: string; note?: string } | null;
  excluded: string[];
  startedAt: string | null;
  endedAt: string | null;
  endReason?: string;
  lastSeq: number;
}

export function initialChamber(): ChamberState {
  return {
    question: "",
    status: "idle",
    simulated: false,
    roster: [],
    limits: null,
    memberStates: {},
    phase: null,
    round: 0,
    phaseSeq: 0,
    messages: [],
    notes: [],
    links: [],
    speaking: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0 },
    final: null,
    initialAnswer: null,
    synthesizerId: null,
    override: null,
    excluded: [],
    startedAt: null,
    endedAt: null,
    lastSeq: 0,
  };
}

const PHASE_LABEL: Record<Phase, string> = {
  interpret: "Interpreting the request",
  independent: "Independent contributions",
  critique: "Critique",
  resolve: "Resolving disagreements",
  synthesize: "Synthesis",
  direct: "Direct address",
};
export const phaseLabel = (p: Phase | null) => (p ? PHASE_LABEL[p] : "Waiting");

function nameOf(s: ChamberState, id: string): string {
  if (id === "prime") return "the Prime";
  return s.roster.find((m) => m.id === id)?.name ?? id;
}

export function reduce(s: ChamberState, e: StoredEvent): ChamberState {
  if (e.seq <= s.lastSeq) return s; // idempotent: replays and reconnects are safe
  const next: ChamberState = { ...s, lastSeq: e.seq };
  switch (e.type) {
    case "session.started":
      next.question = e.question;
      next.roster = e.roster;
      next.limits = e.limits;
      next.simulated = e.simulated;
      next.status = "running";
      next.startedAt = e.at;
      next.memberStates = Object.fromEntries(e.roster.map((m) => [m.id, { state: m.enabled ? "idle" : "offline", seq: e.seq }]));
      break;
    case "phase.started":
      next.phase = e.phase;
      next.round = e.round;
      next.phaseSeq = e.seq;
      next.links = [];
      next.status = "running";
      next.endedAt = null;
      next.notes = [...s.notes, { seq: e.seq, at: e.at, tone: "info", text: `${PHASE_LABEL[e.phase]}${e.round ? ` · round ${e.round}` : ""}` }];
      break;
    case "member.state":
      next.memberStates = { ...s.memberStates, [e.memberId]: { state: e.state, detail: e.detail, seq: e.seq } };
      break;
    case "member.message": {
      const msg: ChamberMessage = {
        seq: e.seq,
        at: e.at,
        messageId: e.messageId,
        memberId: e.memberId,
        kind: e.kind,
        phase: e.phase,
        round: e.round,
        content: e.content,
        replyTo: e.replyTo,
        usage: e.usage,
        durationMs: e.durationMs,
        simulated: e.simulated,
        parseWarning: e.parseWarning,
      };
      next.messages = [...s.messages, msg];
      next.speaking = { memberId: e.memberId, messageId: e.messageId, seq: e.seq };
      break;
    }
    case "member.link":
      next.links = [...s.links, { seq: e.seq, from: e.from, to: e.to, stance: e.stance }];
      break;
    case "member.error":
      next.notes = [...s.notes, { seq: e.seq, at: e.at, tone: "error", memberId: e.memberId, text: `${nameOf(s, e.memberId)}: ${e.code.replace(/_/g, " ")} — ${e.message}` }];
      break;
    case "budget.blocked":
      next.notes = [...s.notes, { seq: e.seq, at: e.at, tone: "warn", memberId: e.memberId, text: `${nameOf(s, e.memberId)} blocked: ${e.reason}` }];
      break;
    case "usage.updated":
      next.usage = { inputTokens: e.inputTokens, outputTokens: e.outputTokens, costUsd: e.costUsd, unpricedCalls: e.unpricedCalls };
      break;
    case "prime.intervention": {
      const d = e.detail as Record<string, unknown>;
      const text =
        e.action === "stop"
          ? "The Prime stopped deliberation"
          : e.action === "exclude"
            ? `The Prime excluded ${nameOf(s, String(d.memberId))}`
            : e.action === "include"
              ? `The Prime re-included ${nameOf(s, String(d.memberId))}`
              : e.action === "another_round"
                ? d.granted
                  ? "The Prime requested another round"
                  : `Another round refused: ${String(d.reason ?? "limit reached")}`
                : e.action === "challenge"
                  ? `The Prime asked the council to challenge: "${String(d.claim)}"`
                  : e.action === "direct"
                    ? `The Prime to ${nameOf(s, String(d.memberId))}: "${String(d.message)}"`
                    : `Prime action: ${e.action}`;
      next.notes = [...s.notes, { seq: e.seq, at: e.at, tone: "prime", text, memberId: typeof d.memberId === "string" ? d.memberId : undefined }];
      if (e.action === "exclude") next.excluded = [...new Set([...s.excluded, String(d.memberId)])];
      if (e.action === "include") next.excluded = s.excluded.filter((x) => x !== String(d.memberId));
      break;
    }
    case "session.final":
      next.final = e.final;
      next.initialAnswer = e.initialAnswer;
      next.synthesizerId = e.synthesizerId;
      break;
    case "session.override":
      next.override = { decision: e.decision, note: e.note };
      next.notes = [...s.notes, { seq: e.seq, at: e.at, tone: "prime", text: "The Prime overrode the council's decision" }];
      break;
    case "session.ended":
      next.status = e.status;
      next.endedAt = e.at;
      next.endReason = e.reason;
      next.links = [];
      next.notes = [
        ...s.notes,
        { seq: e.seq, at: e.at, tone: e.status === "completed" ? "info" : e.status === "failed" ? "error" : "warn", text: `Session ${e.status}${e.reason ? `: ${e.reason}` : ""}` },
      ];
      break;
  }
  return next;
}

export function reduceAll(events: StoredEvent[], upTo = Infinity): ChamberState {
  let s = initialChamber();
  for (const e of events) {
    if (e.seq > upTo) break;
    s = reduce(s, e);
  }
  return s;
}
