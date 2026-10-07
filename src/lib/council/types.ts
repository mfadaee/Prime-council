/**
 * Shared council domain types. Safe to import from client and server code.
 */

export const COUNCIL_ROLES = [
  "chair",
  "analyst",
  "skeptic",
  "researcher",
  "builder",
  "synthesizer",
] as const;
export type CouncilRole = (typeof COUNCIL_ROLES)[number];

export const PROVIDER_KINDS = [
  "openai",
  "anthropic",
  "google",
  "openai_compatible",
  "ollama",
  "demo",
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Integration status shown to the Prime. Never claims more than was checked. */
export type ProviderStatus =
  | "available" // a live check succeeded
  | "configured" // credentials/URL present, not yet checked
  | "unavailable" // a live check failed
  | "not_configured" // missing key or URL
  | "disabled"
  | "demo";

export type MemberState =
  | "idle"
  | "preparing"
  | "speaking"
  | "reviewing"
  | "agreeing"
  | "challenging"
  | "blocked"
  | "offline";

export const MEMBER_STATES: MemberState[] = [
  "idle",
  "preparing",
  "speaking",
  "reviewing",
  "agreeing",
  "challenging",
  "blocked",
  "offline",
];

export type Phase = "interpret" | "independent" | "critique" | "resolve" | "synthesize" | "direct";

export type SessionStatus = "running" | "completed" | "stopped" | "failed";

export interface MemberProfile {
  id: string;
  name: string;
  role: CouncilRole;
  persona: string;
  providerId: string;
  model: string;
  enabled: boolean;
  color: string;
  monogram: string;
  seat: number;
}

/** Roster entry captured when a session starts (what actually deliberated). */
export interface RosterEntry extends MemberProfile {
  providerKind: ProviderKind;
  providerLabel: string;
  simulated: boolean;
  /** Other roster members on the same provider+model (labelled in the UI). */
  sharesModelWith: string[];
}

export interface Limits {
  maxRounds: number; // critique/resolve rounds (default 1)
  hardMaxRounds: number; // absolute cap, including Prime-requested rounds
  concurrency: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  sessionBudgetUsd: number;
  dailyBudgetUsd: number;
  sessionWallClockMs: number;
  /** Allow calls to remote models without configured pricing (cost unknown). */
  allowUnpriced: boolean;
}

export const DEFAULT_LIMITS: Limits = {
  maxRounds: 1,
  hardMaxRounds: 3,
  concurrency: 3,
  maxOutputTokens: 700,
  timeoutMs: 60_000,
  maxRetries: 1,
  sessionBudgetUsd: 0.5,
  dailyBudgetUsd: 2,
  sessionWallClockMs: 5 * 60_000,
  allowUnpriced: false,
};

// ------------------------------------------------------- published content ---

export interface EvidenceItem {
  claim: string;
  source?: string; // URL or citation the member supplied; not verified unless stated
}

export interface Interpretation {
  restatement: string;
  constraints: string[];
  successCriteria: string[];
}

export interface Contribution {
  answer: string;
  rationale: string;
  evidence: EvidenceItem[];
  assumptions: string[];
  confidence: number; // 0..1, self-reported
}

export type Stance = "challenge" | "support" | "refine";

export interface Critique {
  targetMemberId: string;
  claim: string;
  stance: Stance;
  reason: string;
  evidence?: string;
}

export interface CritiqueSet {
  critiques: Critique[];
  overall: "agree" | "partly" | "disagree";
}

export interface Reply {
  response: "revise" | "defend" | "concede";
  updatedAnswer: string;
  reason: string;
}

export interface FinalAnswer {
  answer: string;
  keyEvidence: EvidenceItem[];
  uncertainty: string[];
  disagreements: string[];
  deliberationEffect: string;
  confidence: number;
}

export interface DirectReply {
  reply: string;
}

export type MessageKind =
  | "interpretation"
  | "contribution"
  | "critique"
  | "reply"
  | "synthesis"
  | "direct";

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  source: "provider" | "estimated";
  costUsd: number | null; // null when the model is unpriced
}

// ------------------------------------------------------------------ events ---

export type CouncilEvent =
  | { type: "session.started"; question: string; roster: RosterEntry[]; limits: Limits; simulated: boolean }
  | { type: "phase.started"; phase: Phase; round: number; memberIds: string[] }
  | { type: "member.state"; memberId: string; state: MemberState; detail?: string }
  | {
      type: "member.message";
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
  | {
      type: "member.link";
      from: string;
      to: string;
      stance: Stance | "reply" | "prime";
    }
  | { type: "member.error"; memberId: string; phase: Phase; code: string; message: string; retryable: boolean }
  | { type: "budget.blocked"; memberId: string; reason: string }
  | { type: "usage.updated"; inputTokens: number; outputTokens: number; costUsd: number; unpricedCalls: number }
  | { type: "prime.intervention"; action: PrimeAction["type"]; detail: Record<string, unknown> }
  | { type: "session.final"; final: FinalAnswer; initialAnswer: Contribution | null; synthesizerId: string | null }
  | { type: "session.override"; decision: string; note?: string }
  | { type: "session.ended"; status: SessionStatus; reason?: string };

export type StoredEvent = CouncilEvent & { seq: number; at: string; simulated: boolean };

// ---------------------------------------------------------- Prime controls ---

export type PrimeAction =
  | { type: "stop" }
  | { type: "exclude"; memberId: string }
  | { type: "include"; memberId: string }
  | { type: "another_round" }
  | { type: "challenge"; claim: string; memberIds?: string[] }
  | { type: "direct"; memberId: string; message: string }
  | { type: "override"; decision: string; note?: string };
