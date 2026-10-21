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

/** Integration status shown to the Founder. Never claims more than was checked. */
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

export type Phase = "interpret" | "map" | "independent" | "critique" | "resolve" | "experiment" | "synthesize" | "direct";

/**
 * How a session deliberates.
 * - standard: the usual pipeline. Every member still carries the BeyondTheSystem
 *   lens and may question the framing when it materially matters.
 * - beyond: "Beyond the System" exploration. The Chair maps the current system and
 *   its assumptions, members generate structurally different alternatives, the
 *   council attacks them, one member designs the smallest reversible experiment,
 *   and the result is kept as a discovery record.
 */
export const SESSION_MODES = ["standard", "beyond"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

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
  hardMaxRounds: number; // absolute cap, including Founder-requested rounds
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

// ------------------------------------------------- BeyondTheSystem lens ---

/**
 * constraint  – physical, logical, mathematical or empirically established; not removable by redesign
 * convention  – exists because people created it (a rule, category, incentive, metric); changeable, though it may still encode real knowledge
 * uncertain   – treated as true without sufficient evidence either way
 */
export const ASSUMPTION_KINDS = ["constraint", "convention", "uncertain"] as const;
export type AssumptionKind = (typeof ASSUMPTION_KINDS)[number];

/** The five layers every member examines (alternatives are the fifth). */
export const FRAME_LAYERS = ["reality", "assumption", "constructed", "boundary"] as const;
export type FrameLayer = (typeof FRAME_LAYERS)[number];

export interface FramedAssumption {
  /** Assigned in code for system maps ("A1", "A2", ...); absent on member-level frame checks. */
  id?: string;
  statement: string;
  kind: AssumptionKind;
  layer?: FrameLayer;
  /** Evidence or reasoning behind the classification. */
  basis: string;
  /** Does it materially affect the decision? */
  matters: boolean;
}

/** A member's decision about whether to question the framing of its task. */
export interface FrameCheck {
  challenged: boolean;
  /** Why questioning the framing is, or is not, worth it here. */
  reason: string;
  assumptions: FramedAssumption[];
  /** Where the stated objective may be a proxy for the outcome that matters. */
  proxyRisk?: string;
  /** A different framing of the problem, if one is worth considering. */
  reframe?: string;
}

/** Stage A–B output: the current system and the assumptions that sustain it. */
export interface SystemMap extends Interpretation {
  currentSystem: string;
  produces: string;
  whyExists: string;
  assumptions: FramedAssumption[];
  /** Possibilities excluded by the current framing. */
  boundaries: string[];
  /** Incentives that distort behaviour; processes that became ends in themselves. */
  distortions: string[];
}

/**
 * implementation – a better way to run the current solution
 * redesign       – the system rebuilt from first principles
 * reframe        – changes the problem being solved
 */
export const ALTERNATIVE_LEVELS = ["implementation", "redesign", "reframe"] as const;
export type AlternativeLevel = (typeof ALTERNATIVE_LEVELS)[number];

export interface Alternative {
  /** Assigned in code when published: "<memberId>#<n>". Never taken from model output. */
  id: string;
  title: string;
  description: string;
  level: AlternativeLevel;
  /** System-map assumption ids this alternative drops. */
  removes: string[];
  /** Constraints it explicitly respects. */
  keeps: string[];
}

export interface ExperimentPlan {
  /** False when no experiment is worth running; `reason` says why. */
  justified: boolean;
  reason: string;
  alternativeId: string | null;
  hypothesis: string;
  expectedObservations: string[];
  cost: string;
  risks: string[];
  successCriteria: string[];
  stopConditions: string[];
  reversible: boolean;
}

export const CHANGE_TARGETS = ["prompts", "roles", "orchestration", "evaluation", "memory", "interface", "limits", "security"] as const;
export type ChangeTarget = (typeof CHANGE_TARGETS)[number];

/** A change the council proposes to its own operation. A proposal only — never applied by code. */
export interface ProposedChange {
  target: ChangeTarget;
  change: string;
  why: string;
}

export interface Contribution {
  answer: string;
  rationale: string;
  evidence: EvidenceItem[];
  assumptions: string[];
  confidence: number; // 0..1, self-reported
  /** BeyondTheSystem lens: present when the member considered the framing. */
  frameCheck?: FrameCheck;
  /** Beyond mode: alternatives this member originated (ids assigned in code). */
  alternatives?: Alternative[];
}

export type Stance = "challenge" | "support" | "refine";

export interface Critique {
  targetMemberId: string;
  claim: string;
  stance: Stance;
  reason: string;
  evidence?: string;
  /** The assumption this critique challenges (productive disagreement names it). */
  assumption?: string;
  /** Evidence or experiment that would settle the disagreement. */
  resolveBy?: string;
  /** Beyond mode: the alternative this critique is about (validated in code). */
  alternativeId?: string;
  /** Beyond mode: does the alternative actually escape the original framing? */
  escapesFraming?: boolean;
}

export interface CritiqueSet {
  critiques: Critique[];
  overall: "agree" | "partly" | "disagree";
}

export interface AlternativeUpdate {
  id: string;
  action: "keep" | "revise" | "withdraw";
  note: string;
}

export interface Reply {
  response: "revise" | "defend" | "concede";
  updatedAnswer: string;
  reason: string;
  /** Beyond mode: what happens to this member's own alternatives after critique. */
  alternativeUpdates?: AlternativeUpdate[];
}

export interface FinalAnswer {
  answer: string;
  keyEvidence: EvidenceItem[];
  uncertainty: string[];
  disagreements: string[];
  deliberationEffect: string;
  confidence: number;
  /** Views that did not prevail but should not be lost. */
  minorityViews?: string[];
  /** Beyond mode (stage G). */
  learned?: string[];
  nextQuestions?: string[];
  /** True when the council concluded the conventional approach is already best. */
  conventionalIsBest?: boolean;
  framingVerdict?: string;
  /** Changes the council proposes to its own operation (self-examination). */
  proposedChanges?: ProposedChange[];
}

export interface DirectReply {
  reply: string;
}

export type MessageKind =
  | "interpretation"
  | "system_map"
  | "experiment"
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
  | { type: "session.started"; question: string; roster: RosterEntry[]; limits: Limits; simulated: boolean; mode?: SessionMode }
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
  | { type: "discovery.recorded"; discoveryId: string }
  | { type: "session.ended"; status: SessionStatus; reason?: string };

export type StoredEvent = CouncilEvent & { seq: number; at: string; simulated: boolean };

// ---------------------------------------------------------- Founder controls ---

export type PrimeAction =
  | { type: "stop" }
  | { type: "exclude"; memberId: string }
  | { type: "include"; memberId: string }
  | { type: "another_round" }
  | { type: "challenge"; claim: string; memberIds?: string[] }
  | { type: "direct"; memberId: string; message: string }
  | { type: "override"; decision: string; note?: string };
