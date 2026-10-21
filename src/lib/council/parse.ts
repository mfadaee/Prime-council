import { z } from "zod";
import {
  ALTERNATIVE_LEVELS,
  ASSUMPTION_KINDS,
  CHANGE_TARGETS,
  FRAME_LAYERS,
  type Contribution,
  type CritiqueSet,
  type DirectReply,
  type ExperimentPlan,
  type FinalAnswer,
  type Interpretation,
  type Reply,
  type SystemMap,
} from "./types";

/**
 * Member output is untrusted text. We only ever read the fields below, validated
 * and length-capped. Anything else in the output (instructions, "tool calls",
 * requests to change limits) is ignored — it has no path to application actions.
 */
const s = (max: number) => z.string().trim().max(max);
const list = (max: number, n: number) => z.array(z.string().trim().max(max)).max(n).catch([]);
const evidence = z
  .array(z.object({ claim: s(400), source: z.string().trim().max(500).optional().catch(undefined) }))
  .max(12)
  .catch([]);
const conf = z.coerce.number().min(0).max(1).catch(0.5);

// Lenient helpers for the BeyondTheSystem fields: long text is truncated rather
// than rejected, and a malformed list item is dropped on its own instead of
// discarding the whole contribution.
const t = (max: number) => z.string().transform((x) => x.trim().slice(0, max));
function arrayOf<T>(item: z.ZodType<T>, n: number) {
  // A required array (absent or non-array → []) whose items are validated one by one.
  return z
    .array(z.unknown())
    .catch([])
    .transform((v): T[] =>
      v
        .flatMap((x) => {
          const r = item.safeParse(x);
          return r.success ? [r.data] : [];
        })
        .slice(0, n),
    );
}
const strings = (max: number, n: number) => arrayOf(t(max), n);
const flag = z.boolean().catch(false);

const framedAssumption = z.object({
  statement: t(400).refine((x) => x.length > 0),
  kind: z.enum(ASSUMPTION_KINDS).catch("uncertain"),
  layer: z.enum(FRAME_LAYERS).optional().catch(undefined),
  basis: t(500).catch(""),
  matters: flag,
});

export const frameCheckSchema = z.object({
  challenged: flag,
  reason: t(800).catch(""),
  assumptions: arrayOf(framedAssumption, 6),
  proxyRisk: t(600).optional().catch(undefined),
  reframe: t(800).optional().catch(undefined),
});

/** Ids are placeholders here; the orchestrator assigns real ones (see sanitizeAlternatives). */
const alternativeInput = z
  .object({
    title: t(160).refine((x) => x.length > 0),
    description: t(1200).catch(""),
    level: z.enum(ALTERNATIVE_LEVELS).catch("implementation"),
    removes: strings(12, 8),
    keeps: strings(240, 6),
  })
  .transform((a) => ({ id: "", ...a }));

export const interpretationSchema = z.object({
  restatement: s(1200),
  constraints: list(300, 10),
  successCriteria: list(300, 10),
});

export const contributionSchema = z.object({
  answer: s(6000),
  rationale: s(2000).catch(""),
  evidence,
  assumptions: list(400, 10),
  confidence: conf,
  frameCheck: frameCheckSchema.optional().catch(undefined),
  alternatives: arrayOf(alternativeInput, 3).optional(),
});

export const systemMapSchema = z.object({
  restatement: t(1200).catch(""),
  constraints: strings(300, 10),
  successCriteria: strings(300, 10),
  currentSystem: t(1500).catch(""),
  produces: t(800).catch(""),
  whyExists: t(800).catch(""),
  assumptions: arrayOf(framedAssumption, 12),
  boundaries: strings(400, 8),
  distortions: strings(400, 8),
});

export const experimentSchema = z.object({
  justified: flag,
  reason: t(800).catch(""),
  alternativeId: t(40).nullable().catch(null),
  hypothesis: t(800).catch(""),
  expectedObservations: strings(400, 6),
  cost: t(300).catch(""),
  risks: strings(400, 6),
  successCriteria: strings(400, 6),
  stopConditions: strings(400, 6),
  reversible: flag,
});

export const critiqueSetSchema = z.object({
  critiques: z
    .array(
      z.object({
        targetMemberId: s(80),
        claim: s(600),
        stance: z.enum(["challenge", "support", "refine"]).catch("refine"),
        reason: s(1500),
        evidence: s(800).optional().catch(undefined),
        assumption: t(400).optional().catch(undefined),
        resolveBy: t(500).optional().catch(undefined),
        alternativeId: t(40).optional().catch(undefined),
        escapesFraming: z.boolean().optional().catch(undefined),
      }),
    )
    .max(8)
    .catch([]),
  overall: z.enum(["agree", "partly", "disagree"]).catch("partly"),
});

export const replySchema = z.object({
  response: z.enum(["revise", "defend", "concede"]).catch("defend"),
  updatedAnswer: s(6000),
  reason: s(1500).catch(""),
  alternativeUpdates: arrayOf(
    z.object({ id: t(40), action: z.enum(["keep", "revise", "withdraw"]).catch("keep"), note: t(400).catch("") }),
    6,
  ).optional(),
});

export const finalSchema = z.object({
  answer: s(10000),
  keyEvidence: evidence,
  uncertainty: list(500, 10),
  disagreements: list(500, 10),
  deliberationEffect: s(1500).catch(""),
  confidence: conf,
  minorityViews: strings(500, 8).optional(),
  learned: strings(500, 8).optional(),
  nextQuestions: strings(400, 6).optional(),
  conventionalIsBest: z.boolean().optional().catch(undefined),
  framingVerdict: t(1000).optional().catch(undefined),
  proposedChanges: arrayOf(z.object({ target: z.enum(CHANGE_TARGETS), change: t(600), why: t(600).catch("") }), 5).optional(),
});

export const directSchema = z.object({ reply: s(6000) });

/** Find the first balanced top-level JSON object in model text (handles ```json fences and prose). */
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface Parsed<T> {
  value: T;
  warning?: string;
}

function parseWith<T>(schema: z.ZodType<T>, text: string, fallback: (t: string) => T): Parsed<T> {
  const obj = extractJsonObject(text);
  if (obj) {
    const r = schema.safeParse(obj);
    if (r.success) return { value: r.data };
  }
  const trimmed = text.trim().slice(0, 6000);
  return { value: fallback(trimmed), warning: "Member did not return the requested structure; showing its plain text." };
}

export const parseInterpretation = (t: string) =>
  parseWith<Interpretation>(interpretationSchema, t, (x) => ({ restatement: x, constraints: [], successCriteria: [] }));
export const parseContribution = (t: string) =>
  parseWith<Contribution>(contributionSchema, t, (x) => ({ answer: x, rationale: "", evidence: [], assumptions: [], confidence: 0.5 }));
export const parseCritiques = (t: string) =>
  parseWith<CritiqueSet>(critiqueSetSchema, t, () => ({ critiques: [], overall: "partly" }));
export const parseReply = (t: string) =>
  parseWith<Reply>(replySchema, t, (x) => ({ response: "defend", updatedAnswer: x, reason: "" }));
export const parseFinal = (t: string) =>
  parseWith<FinalAnswer>(finalSchema, t, (x) => ({
    answer: x,
    keyEvidence: [],
    uncertainty: [],
    disagreements: [],
    deliberationEffect: "",
    confidence: 0.5,
  }));
export const parseSystemMap = (t: string) =>
  parseWith<SystemMap>(systemMapSchema, t, (x) => ({
    restatement: x,
    constraints: [],
    successCriteria: [],
    currentSystem: "",
    produces: "",
    whyExists: "",
    assumptions: [],
    boundaries: [],
    distortions: [],
  }));
export const parseExperiment = (t: string) =>
  parseWith<ExperimentPlan>(experimentSchema, t, (x) => ({
    justified: false,
    reason: x.slice(0, 800),
    alternativeId: null,
    hypothesis: "",
    expectedObservations: [],
    cost: "",
    risks: [],
    successCriteria: [],
    stopConditions: [],
    reversible: false,
  }));
export const parseDirect = (t: string) => parseWith<DirectReply>(directSchema, t, (x) => ({ reply: x }));
