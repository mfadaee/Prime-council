/**
 * BeyondTheSystem — the deterministic half of the capability.
 *
 * Models propose framings, assumptions and alternatives. This module checks them
 * in code, so that nothing the council publishes is taken on its word:
 *  - an alternative that "removes" a fundamental constraint is flagged, not celebrated;
 *  - near-identical alternatives are recognised as one idea, not counted twice;
 *  - quality checks report concrete pass/attention findings — never a novelty score,
 *    and never a reward for the number of challenges raised;
 *  - proposals to change the council itself are records only: code never applies them.
 *
 * Pure and dependency-free: shared by the orchestrator, the discovery record and the UI.
 */
import type {
  Alternative,
  AlternativeLevel,
  AssumptionKind,
  ChangeTarget,
  Contribution,
  CritiqueSet,
  ExperimentPlan,
  FinalAnswer,
  FrameCheck,
  FramedAssumption,
  Limits,
  Reply,
  RosterEntry,
  SystemMap,
} from "./types";

// ------------------------------------------------------------ the lens ---

/** The five layers every member examines. */
export const FIVE_LAYERS: { id: string; title: string; question: string }[] = [
  { id: "reality", title: "Reality", question: "What is physically, logically, mathematically or empirically constrained?" },
  { id: "assumption", title: "Assumptions", question: "What are we treating as true without sufficient evidence?" },
  { id: "constructed", title: "Constructed reality", question: "Which rules, categories, objectives, incentives, institutions or measures of success exist because people created them?" },
  { id: "boundary", title: "System boundaries", question: "What possibilities does the current framing of the problem exclude?" },
  { id: "alternative", title: "Alternative possibilities", question: "What could we create if we changed the framing itself?" },
];

/** The assumption-challenging loop: asked internally, used proportionately. */
export const FRAMING_QUESTIONS = [
  "Why is this the problem we are solving?",
  "Who defined the objective, and what assumptions shaped it?",
  "Are we optimizing a meaningful outcome or a proxy for one?",
  "Which constraints are real, and which are conventions?",
  "What would we do if we started from zero?",
  "What would someone propose who did not inherit this system's assumptions?",
  "Can we change the problem rather than improve its current solution?",
  "What possibility is hard to notice from inside the existing framework?",
];

/** Recursive self-examination: the council applies its principles to itself. */
export const SELF_EXAMINATION_QUESTIONS = [
  "Are our agent roles limiting what we can discover?",
  "Are our evaluation checks causing us to overlook important outcomes?",
  "Are our memory and consensus mechanisms reinforcing outdated beliefs?",
  "Are we optimizing activity instead of progress?",
  "Are we generating new ideas or recombining familiar patterns?",
  "Have our safeguards become unnecessarily restrictive, or are our experiments insufficiently controlled?",
  "What would a completely different architecture look like?",
  "Which parts of the council would we remove if we were designing it today?",
];

export const KIND_META: Record<AssumptionKind, { label: string; description: string }> = {
  constraint: { label: "Fundamental constraint", description: "Physical, logical, mathematical or empirically established — keep it" },
  convention: { label: "Changeable convention", description: "Exists because people created it; may still encode real knowledge" },
  uncertain: { label: "Unverified assumption", description: "Treated as true without sufficient evidence" },
};

export const LEVEL_META: Record<AlternativeLevel, { label: string; description: string }> = {
  implementation: { label: "Better implementation", description: "Improves the current solution" },
  redesign: { label: "System redesign", description: "Rebuilds the system from first principles" },
  reframe: { label: "Reframes the problem", description: "Changes the problem being solved" },
};

// ------------------------------------------------------ text similarity ---

const STOP = new Set(
  "the and for with that this from into are was were been being its their our your they them than then but not can could would should will has have had more most less what which who why how when where all any each such also only very just about over under there here one two use using via per out new way make makes much many some other these those".split(
    " ",
  ),
);

function stem(w: string): string {
  const s = w.replace(/(ings|ing|edly|ed|es|s)$/, "");
  return s.length >= 3 ? s : w;
}

/** Content words of a text, lightly stemmed. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** How alike two alternatives are: wording plus which assumptions they drop. */
export function alternativeSimilarity(a: Pick<Alternative, "title" | "description" | "removes">, b: Pick<Alternative, "title" | "description" | "removes">): number {
  const text = jaccard(tokens(`${a.title} ${a.description}`), tokens(`${b.title} ${b.description}`));
  const ra = new Set(a.removes);
  const rb = new Set(b.removes);
  if (!ra.size && !rb.size) return text;
  return 0.6 * text + 0.4 * jaccard(ra, rb);
}

export const DUPLICATE_THRESHOLD = 0.55;

/** Group alternatives that are superficial variations of the same idea. Returns groups of ids (first = earliest). */
export function distinctGroups(alts: Alternative[], threshold = DUPLICATE_THRESHOLD): string[][] {
  const parent = alts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < alts.length; i++) {
    for (let j = i + 1; j < alts.length; j++) {
      if (alternativeSimilarity(alts[i], alts[j]) >= threshold) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, string[]>();
  alts.forEach((a, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), a.id]));
  return [...groups.values()];
}

// ------------------------------------------------- sanitising model output ---

const MAX_MAP_ASSUMPTIONS = 12;
const MAX_ALTERNATIVES_PER_MEMBER = 3;

/** Assign stable ids (A1, A2, ...) to a system map's assumptions. Ids are never taken from the model. */
export function withAssumptionIds(map: SystemMap): SystemMap {
  return {
    ...map,
    assumptions: map.assumptions.slice(0, MAX_MAP_ASSUMPTIONS).map((a, i) => ({ ...a, id: `A${i + 1}` })),
  };
}

/**
 * Turn a member's raw alternatives into published ones: ids are assigned in code
 * ("<memberId>#<n>"), `removes` is limited to assumption ids that exist in the map,
 * empty entries are dropped and the count is capped.
 */
export function sanitizeAlternatives(raw: Omit<Alternative, "id">[] | undefined, memberId: string, map: SystemMap | null): Alternative[] {
  const known = new Set((map?.assumptions ?? []).map((a) => a.id).filter(Boolean) as string[]);
  return (raw ?? [])
    .filter((a) => a.title.trim() && a.description.trim())
    .slice(0, MAX_ALTERNATIVES_PER_MEMBER)
    .map((a, i) => ({
      id: `${memberId}#${i + 1}`,
      title: a.title,
      description: a.description,
      level: a.level,
      removes: [...new Set(a.removes.map((r) => r.trim().toUpperCase()).filter((r) => known.has(r)))],
      keeps: a.keeps,
    }));
}

/** Alternatives that drop an assumption the map classified as a fundamental constraint. */
export function constraintViolations(alts: Alternative[], map: SystemMap | null): { alternativeId: string; assumptionId: string; statement: string }[] {
  const byId = new Map((map?.assumptions ?? []).map((a) => [a.id, a]));
  const out: { alternativeId: string; assumptionId: string; statement: string }[] = [];
  for (const alt of alts) {
    for (const r of alt.removes) {
      const a = byId.get(r);
      if (a?.kind === "constraint") out.push({ alternativeId: alt.id, assumptionId: r, statement: a.statement });
    }
  }
  return out;
}

/** The originator of an alternative is encoded in its code-assigned id. */
export const originatorOf = (alternativeId: string) => alternativeId.split("#")[0];

// ----------------------------------------------------------- the view ---

export interface BeyondInput {
  map: SystemMap | null;
  /** Independent contributions (stage C–D), in publication order. */
  contributions: { memberId: string; contribution: Contribution }[];
  critiques: { from: string; round: number; set: CritiqueSet }[];
  replies: { member: string; round: number; reply: Reply }[];
  experiment: { memberId: string; plan: ExperimentPlan } | null;
  final: FinalAnswer | null;
}

export interface Stand {
  memberId: string;
  round: number;
  reason: string;
  assumption?: string;
  resolveBy?: string;
  escapesFraming?: boolean;
}

export interface AssumptionView extends FramedAssumption {
  id: string;
  /** Members who questioned this assumption or reclassified it, and how. */
  challengedBy: { memberId: string; note: string }[];
  /** Alternatives that drop it. */
  removedBy: string[];
}

export interface AlternativeView extends Alternative {
  originatorId: string;
  status: "standing" | "revised" | "withdrawn";
  supporters: Stand[];
  challengers: Stand[];
  refiners: Stand[];
  escapes: { yes: number; no: number };
  /** Findings computed in code (e.g. drops a fundamental constraint). */
  flags: string[];
  /** How the idea evolved: proposal, critiques, revisions. */
  history: { round: number; memberId: string; text: string }[];
  /** Set when this is a superficial variation of an earlier alternative. */
  duplicateOf?: string;
}

export type CheckStatus = "pass" | "attention" | "not_applicable";

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface BeyondView {
  assumptions: AssumptionView[];
  alternatives: AlternativeView[];
  /** Alternatives that differ structurally (near-duplicates merged). */
  distinctCount: number;
  /** Distinct alternatives still standing that keep every fundamental constraint. */
  viableDistinct: number;
  frameChallenges: { memberId: string; check: FrameCheck }[];
  experiment: { memberId: string; plan: ExperimentPlan } | null;
  checks: QualityCheck[];
}

function matchAssumption(text: string, assumptions: AssumptionView[]): AssumptionView | undefined {
  const idHit = text.match(/\bA(\d{1,2})\b/);
  if (idHit) {
    const hit = assumptions.find((a) => a.id === `A${idHit[1]}`);
    if (hit) return hit;
  }
  const t = tokens(text);
  let best: AssumptionView | undefined;
  let score = 0;
  for (const a of assumptions) {
    const s = jaccard(t, tokens(a.statement));
    if (s > score) [best, score] = [a, s];
  }
  return score >= 0.3 ? best : undefined;
}

export function buildBeyondView(input: BeyondInput): BeyondView {
  const assumptions: AssumptionView[] = (input.map?.assumptions ?? [])
    .filter((a): a is FramedAssumption & { id: string } => Boolean(a.id))
    .map((a) => ({ ...a, challengedBy: [], removedBy: [] }));

  // Alternatives, in publication order, each with its originator.
  const alternatives: AlternativeView[] = [];
  const frameChallenges: BeyondView["frameChallenges"] = [];
  for (const { memberId, contribution } of input.contributions) {
    for (const alt of contribution.alternatives ?? []) {
      alternatives.push({
        ...alt,
        originatorId: originatorOf(alt.id),
        status: "standing",
        supporters: [],
        challengers: [],
        refiners: [],
        escapes: { yes: 0, no: 0 },
        flags: [],
        history: [{ round: 0, memberId, text: `Proposed (${LEVEL_META[alt.level].label.toLowerCase()})` }],
      });
    }
    const fc = contribution.frameCheck;
    if (fc) {
      if (fc.challenged) frameChallenges.push({ memberId, check: fc });
      // A member reclassifying a mapped assumption is a real disagreement about what is fixed.
      for (const mine of fc.assumptions) {
        const a = matchAssumption(mine.statement, assumptions);
        if (a && a.kind !== mine.kind) a.challengedBy.push({ memberId, note: `classifies it as ${KIND_META[mine.kind].label.toLowerCase()}: ${mine.basis}` });
      }
    }
  }
  const altById = new Map(alternatives.map((a) => [a.id, a]));
  for (const alt of alternatives) {
    for (const r of alt.removes) assumptions.find((a) => a.id === r)?.removedBy.push(alt.id);
  }

  // Critiques → stands on alternatives; named assumptions → challenges on the map.
  for (const c of input.critiques) {
    for (const k of c.set.critiques) {
      let alt = k.alternativeId ? altById.get(k.alternativeId) : undefined;
      if (alt && alt.originatorId !== k.targetMemberId) alt = undefined; // must match the member being critiqued
      if (!alt) {
        const own = alternatives.filter((a) => a.originatorId === k.targetMemberId);
        if (own.length === 1) alt = own[0];
      }
      if (alt && alt.originatorId !== c.from) {
        const stand: Stand = { memberId: c.from, round: c.round, reason: k.reason, assumption: k.assumption, resolveBy: k.resolveBy, escapesFraming: k.escapesFraming };
        (k.stance === "support" ? alt.supporters : k.stance === "challenge" ? alt.challengers : alt.refiners).push(stand);
        if (k.escapesFraming === true) alt.escapes.yes++;
        if (k.escapesFraming === false) alt.escapes.no++;
        alt.history.push({ round: c.round, memberId: c.from, text: `${k.stance === "challenge" ? "Challenged" : k.stance === "support" ? "Supported" : "Refined"}: ${k.reason}` });
      }
      if (k.stance === "challenge" && k.assumption) {
        const a = matchAssumption(k.assumption, assumptions);
        if (a && !a.challengedBy.some((x) => x.memberId === c.from)) a.challengedBy.push({ memberId: c.from, note: k.reason });
      }
    }
  }

  // Replies → how originators revised or withdrew their ideas. Withdrawn ideas stay on record.
  for (const r of input.replies) {
    for (const u of r.reply.alternativeUpdates ?? []) {
      const alt = altById.get(u.id);
      if (!alt || alt.originatorId !== r.member || u.action === "keep") continue;
      alt.status = u.action === "withdraw" ? "withdrawn" : "revised";
      alt.history.push({ round: r.round, memberId: r.member, text: `${u.action === "withdraw" ? "Withdrawn" : "Revised"}: ${u.note}` });
    }
  }

  // Code findings.
  for (const v of constraintViolations(alternatives, input.map)) {
    altById.get(v.alternativeId)?.flags.push(`Drops ${v.assumptionId}, which the map classifies as a fundamental constraint (“${v.statement}”)`);
  }
  const groups = distinctGroups(alternatives);
  for (const g of groups) {
    for (const id of g.slice(1)) {
      const alt = altById.get(id)!;
      alt.duplicateOf = g[0];
      alt.flags.push(`Superficial variation of ${g[0]} — counted as one idea`);
    }
  }

  const viable = groups.filter((g) => g.some((id) => {
    const a = altById.get(id)!;
    return a.status !== "withdrawn" && !a.flags.some((f) => f.includes("fundamental constraint"));
  })).length;
  const view: BeyondView = { assumptions, alternatives, distinctCount: groups.length, viableDistinct: viable, frameChallenges, experiment: input.experiment, checks: [] };
  view.checks = qualityChecks(view, input.final);
  return view;
}

// ------------------------------------------------------ quality checks ---

/**
 * Concrete findings, not a score. The council is not rewarded for novelty, for
 * disagreement, or for the number of assumptions it challenges.
 */
export function qualityChecks(view: Omit<BeyondView, "checks">, final: FinalAnswer | null): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });
  const { assumptions, alternatives } = view;

  const material = assumptions.filter((a) => a.matters);
  add(
    "material_assumption",
    "Found an assumption that materially affects the decision",
    material.length ? "pass" : "attention",
    material.length ? material.map((a) => `${a.id}: ${a.statement}`).join(" · ") : "No mapped assumption was marked as material.",
  );

  const kinds = new Set(assumptions.map((a) => a.kind));
  add(
    "constraint_vs_convention",
    "Separated real constraints from changeable conventions",
    !assumptions.length ? "attention" : kinds.has("constraint") && (kinds.has("convention") || kinds.has("uncertain")) ? "pass" : "attention",
    !assumptions.length
      ? "The system map lists no assumptions."
      : !kinds.has("constraint")
        ? "Nothing was treated as a fundamental constraint — check that real limits were not dismissed as arbitrary."
        : !kinds.has("convention") && !kinds.has("uncertain")
          ? "Everything was treated as fixed — fine only if no convention shapes the problem."
          : `${assumptions.filter((a) => a.kind === "constraint").length} constraint(s), ${assumptions.filter((a) => a.kind !== "constraint").length} convention(s) or unverified assumption(s).`,
  );

  const standing = alternatives.filter((a) => !a.duplicateOf);
  const conventional = final?.conventionalIsBest === true;
  const n = view.viableDistinct;
  const excluded = view.distinctCount - n;
  add(
    "distinct_alternatives",
    "Generated structurally different alternatives",
    n >= 3 ? "pass" : conventional && view.distinctCount >= 1 ? "pass" : "attention",
    `${n} viable distinct alternative(s)${alternatives.length - view.distinctCount ? `; ${alternatives.length - view.distinctCount} near-duplicate(s) merged` : ""}${excluded ? `; ${excluded} withdrawn or constraint-violating not counted` : ""}${conventional ? "; the council concluded the conventional approach is already best" : ""}.`,
  );

  const reframes = standing.filter((a) => a.level === "reframe");
  add(
    "reframe_present",
    "At least one alternative challenges the framing itself",
    reframes.length ? "pass" : conventional ? "not_applicable" : "attention",
    reframes.length ? reframes.map((a) => a.title).join(" · ") : conventional ? "Conventional approach judged best." : "Every alternative improves the current solution rather than questioning the problem.",
  );

  const violations = alternatives.filter((a) => a.flags.some((f) => f.includes("fundamental constraint")));
  add(
    "no_constraint_removed",
    "No alternative depends on removing a fundamental constraint",
    violations.length ? "attention" : "pass",
    violations.length ? violations.map((a) => `${a.title} (${a.id})`).join(" · ") : "All alternatives keep the constraints the map identified.",
  );

  const unexamined = standing.filter((a) => a.status !== "withdrawn" && !a.supporters.length && !a.challengers.length && !a.refiners.length);
  add(
    "cross_examined",
    "Every alternative was examined by someone other than its originator",
    !standing.length ? "not_applicable" : unexamined.length ? "attention" : "pass",
    !standing.length ? "No alternatives." : unexamined.length ? `Not examined: ${unexamined.map((a) => a.title).join(" · ")}` : "Each alternative received support, challenge or refinement.",
  );

  const exp = view.experiment?.plan;
  const missing = exp && exp.justified ? [!exp.hypothesis && "hypothesis", !exp.successCriteria.length && "success criteria", !exp.stopConditions.length && "stop conditions", !exp.reversible && "reversibility"].filter(Boolean) : [];
  add(
    "falsifiable_experiment",
    "Proposed a falsifiable, reversible experiment (or explained why none is needed)",
    !exp ? "attention" : !exp.justified ? (exp.reason ? "pass" : "attention") : missing.length ? "attention" : "pass",
    !exp ? "No experiment was designed." : !exp.justified ? exp.reason || "Marked unnecessary without a reason." : missing.length ? `Missing: ${missing.join(", ")}.` : exp.hypothesis,
  );

  const contested = alternatives.some((a) => a.challengers.length && (a.supporters.length || a.status !== "withdrawn")) || Boolean(final?.disagreements.length);
  const kept = (final?.minorityViews?.length ?? 0) + (final?.disagreements.length ?? 0);
  add(
    "minority_retained",
    "Minority views were preserved",
    !contested ? "not_applicable" : kept ? "pass" : "attention",
    !contested ? "No contested idea." : kept ? `${kept} minority view(s) or disagreement(s) recorded; every alternative stays in the discovery record.` : "The idea was contested but the final answer records no minority view.",
  );
  return checks;
}

// ---------------------------------------------------------- outcomes ---

/** Outcome measures for evaluation against a baseline. Counts are reported, not rewarded. */
export interface OutcomeMetrics {
  materialAssumptions: number;
  conventionsIdentified: number;
  distinctAlternatives: number;
  reframes: number;
  constraintViolations: number;
  falsifiableExperiment: boolean;
  minorityRetained: boolean;
  conventionalIsBest: boolean;
}

export function outcomeMetrics(view: BeyondView, final: FinalAnswer | null): OutcomeMetrics {
  const check = (id: string) => view.checks.find((c) => c.id === id)?.status;
  return {
    materialAssumptions: view.assumptions.filter((a) => a.matters).length,
    conventionsIdentified: view.assumptions.filter((a) => a.kind !== "constraint" && a.matters).length,
    distinctAlternatives: view.viableDistinct,
    reframes: view.alternatives.filter((a) => a.level === "reframe" && !a.duplicateOf).length,
    constraintViolations: view.alternatives.filter((a) => a.flags.some((f) => f.includes("fundamental constraint"))).length,
    falsifiableExperiment: check("falsifiable_experiment") === "pass" && Boolean(view.experiment?.plan.justified),
    minorityRetained: check("minority_retained") !== "attention",
    conventionalIsBest: final?.conventionalIsBest === true,
  };
}

/**
 * Baseline metrics for a standard session: what the ordinary pipeline surfaced
 * through members' frame checks and their (blind) independent answers.
 */
export function standardMetrics(contributions: Contribution[], final: FinalAnswer | null): OutcomeMetrics {
  const framed = contributions.flatMap((c) => c.frameCheck?.assumptions ?? []);
  const answers: Alternative[] = contributions.map((c, i) => ({ id: `s#${i + 1}`, title: "", description: c.answer, level: "implementation", removes: [], keeps: [] }));
  return {
    materialAssumptions: framed.filter((a) => a.matters).length,
    conventionsIdentified: framed.filter((a) => a.kind !== "constraint" && a.matters).length,
    distinctAlternatives: answers.length ? distinctGroups(answers).length : 0,
    reframes: contributions.filter((c) => c.frameCheck?.reframe).length,
    constraintViolations: 0,
    falsifiableExperiment: false,
    minorityRetained: Boolean(final?.disagreements.length || final?.minorityViews?.length),
    conventionalIsBest: final?.conventionalIsBest === true,
  };
}

export function compareToBaseline(beyond: OutcomeMetrics, baseline: OutcomeMetrics): { metric: keyof OutcomeMetrics; beyond: number | boolean; baseline: number | boolean; better: boolean | null }[] {
  const lowerIsBetter = new Set<keyof OutcomeMetrics>(["constraintViolations"]);
  return (Object.keys(beyond) as (keyof OutcomeMetrics)[]).map((metric) => {
    const b = beyond[metric];
    const s = baseline[metric];
    const better = metric === "conventionalIsBest" ? null : typeof b === "number" && typeof s === "number" ? (b === s ? null : lowerIsBetter.has(metric) ? b < s : b > s) : b === s ? null : Boolean(b);
    return { metric, beyond: b, baseline: s, better };
  });
}

// -------------------------------------------------- linking discoveries ---

export interface LinkableDiscovery {
  id: string;
  question: string;
  assumptions: { id?: string; statement: string }[];
}

/** Discoveries that rest on similar assumptions — recurring assumptions across domains. */
export function relatedDiscoveries(target: LinkableDiscovery, others: LinkableDiscovery[], threshold = 0.4, limit = 5) {
  const mine = target.assumptions.map((a) => ({ a, t: tokens(a.statement) }));
  const out: { id: string; question: string; shared: { mine: string; theirs: string }[] }[] = [];
  for (const o of others) {
    if (o.id === target.id) continue;
    const shared: { mine: string; theirs: string }[] = [];
    for (const theirs of o.assumptions) {
      const tt = tokens(theirs.statement);
      const hit = mine.find((m) => jaccard(m.t, tt) >= threshold);
      if (hit) shared.push({ mine: hit.a.statement, theirs: theirs.statement });
    }
    if (shared.length) out.push({ id: o.id, question: o.question, shared });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length).slice(0, limit);
}

/** A bounded summary of an earlier investigation, so a revisit builds on it instead of starting over. */
export function revisitContext(d: {
  question: string;
  createdAt: string;
  assumptions: { id?: string; statement: string; kind: string; status?: string }[];
  alternatives: { id: string; title: string; level: string; status?: string }[];
  experiment: { status: string; plan?: { hypothesis?: string } | null; result?: { outcome: string; observations: string } | null } | null;
  lessons: string[];
}): string {
  const lines = [
    `Earlier investigation (${d.createdAt.slice(0, 10)}): ${d.question}`,
    "Assumptions examined:",
    ...d.assumptions.slice(0, 10).map((a) => `- ${a.id ?? "?"} [${a.kind}${a.status && a.status !== "open" ? `, ${a.status}` : ""}] ${a.statement}`),
    "Alternatives considered:",
    ...d.alternatives.slice(0, 9).map((a) => `- ${a.id} [${a.level}${a.status ? `, ${a.status}` : ""}] ${a.title}`),
  ];
  if (d.experiment) {
    lines.push(`Experiment: ${d.experiment.status}${d.experiment.plan?.hypothesis ? ` — hypothesis: ${d.experiment.plan.hypothesis}` : ""}`);
    if (d.experiment.result) lines.push(`Result: ${d.experiment.result.outcome} — ${d.experiment.result.observations}`);
  }
  if (d.lessons.length) lines.push("Lessons recorded:", ...d.lessons.slice(0, 8).map((l) => `- ${l}`));
  return lines.join("\n").slice(0, 3500);
}

// -------------------------------------------- recursive self-examination ---

/** A factual description of how this council actually operates, from its live configuration. */
export function describeCouncil(roster: Pick<RosterEntry, "name" | "role" | "enabled" | "simulated" | "providerId" | "model">[], limits: Limits): string {
  const seated = roster.filter((m) => m.enabled);
  const families = new Set(seated.filter((m) => !m.simulated).map((m) => `${m.providerId}:${m.model}`));
  return [
    `Seats: ${seated.map((m) => `${m.name} (${m.role})`).join(", ") || "none"}. Distinct real model families: ${families.size}${seated.some((m) => m.simulated) ? "; some seats are simulated" : ""}.`,
    "Pipeline: the Chair interprets the request; contributors answer independently and blind to each other; members critique each other's published work; challenged members revise, defend or concede; the Synthesizer writes the final answer weighing evidence over majority.",
    `Limits enforced in code: ${limits.maxRounds} critique round(s) by default, hard cap ${limits.hardMaxRounds}; concurrency ${limits.concurrency}; ${limits.maxOutputTokens} output tokens per call; ${Math.round(limits.timeoutMs / 1000)} s per call; ${limits.maxRetries} retries; $${limits.sessionBudgetUsd} per session and $${limits.dailyBudgetUsd} per day (estimated).`,
    "Memory: only items the Founder approved are given to members, wrapped as untrusted data. Discoveries are kept separately and enter a session only when the Founder revisits one.",
    "Evaluation: Beyond-the-System sessions are checked in code (material assumption found, constraints separated from conventions, distinct alternatives, a reframe, no fundamental constraint removed, cross-examination, falsifiable experiment, minority views kept). There is no novelty score.",
    "Autonomy: background sessions, suggestions and governance are off by default, separately budgeted and pausable. Proposed changes to the council are recorded for the Founder; code never applies them.",
  ].join("\n");
}

export function selfExaminationQuestion(focus?: string): string {
  return `Examine the Prime Council itself${focus ? `, focusing on: ${focus}` : ""}. Identify the one assumption in how the council operates that most limits what it can discover, and decide whether a change is justified — concluding that no change is needed is a valid outcome. Questions to consider: ${SELF_EXAMINATION_QUESTIONS.join(" ")}`;
}

// ------------------------------------------------- change authorisation ---

/** Who must approve a proposed change to the council, by area. Code never applies proposals. */
export interface ChangePolicy {
  target: ChangeTarget;
  autoApply: false;
  sensitive: boolean;
  requires: string[];
}

const SENSITIVE_TARGETS: ReadonlySet<ChangeTarget> = new Set(["limits", "security", "orchestration"]);

export function changePolicy(target: ChangeTarget): ChangePolicy {
  const sensitive = SENSITIVE_TARGETS.has(target);
  return {
    target,
    autoApply: false,
    sensitive,
    requires: [
      "Founder approval of the proposal",
      "a branch with tests, passing CI and a pull request",
      sensitive ? "human code review (sensitive area: never auto-merged)" : "review under the normal pull-request rules",
    ],
  };
}
