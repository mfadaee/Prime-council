/**
 * Discovery record shapes. Safe to import from client and server code.
 */
import type { AlternativeView, AssumptionView, ChangePolicy, QualityCheck } from "@/lib/council/beyond";
import type { ChangeTarget, EvidenceItem, ExperimentPlan } from "@/lib/council/types";

export const DISCOVERY_STATUSES = ["open", "experimenting", "concluded", "archived", "incomplete"] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/** What the council (or the Founder, after an experiment) now believes about an assumption. */
export const ASSUMPTION_STATUSES = ["open", "held", "revised", "refuted"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export interface DiscoveryAssumption extends AssumptionView {
  status: AssumptionStatus;
  revision?: string;
}

export interface DiscoveryAlternative extends AlternativeView {
  originatorName: string;
}

export const EXPERIMENT_STATUSES = ["proposed", "running", "completed", "rejected", "not_justified"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export interface ExperimentResult {
  outcome: "supported" | "refuted" | "inconclusive";
  observations: string;
  recordedAt: string;
}

/** Experiments are proposals. The Founder runs them and records what happened. */
export interface DiscoveryExperiment {
  plan: ExperimentPlan;
  designedBy: string;
  designedByName: string;
  status: ExperimentStatus;
  result: ExperimentResult | null;
}

export const FOLLOW_UP_STATUSES = ["proposed", "approved", "rejected", "done"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export interface FollowUp {
  id: string;
  kind: "investigate" | "process_change";
  text: string;
  target?: ChangeTarget;
  why?: string;
  status: FollowUpStatus;
  /** For changes to the council itself: who must approve, and why it can never be applied automatically. */
  policy?: ChangePolicy;
}

export interface ExistingSystem {
  currentSystem: string;
  produces: string;
  whyExists: string;
  boundaries: string[];
  distortions: string[];
}

/** A discovery as the API returns it. */
export interface DiscoveryRecord {
  id: string;
  sessionId: string;
  parentId: string | null;
  scope: "question" | "council";
  status: DiscoveryStatus;
  question: string;
  framing: string;
  existingSystem: ExistingSystem;
  assumptions: DiscoveryAssumption[];
  constraints: string[];
  alternatives: DiscoveryAlternative[];
  checks: QualityCheck[];
  answer: string;
  evidence: EvidenceItem[];
  confidence: number | null;
  uncertainty: string[];
  minorityViews: string[];
  experiment: DiscoveryExperiment | null;
  lessons: string[];
  followUps: FollowUp[];
  simulated: boolean;
  createdAt: string;
  updatedAt: string;
}
