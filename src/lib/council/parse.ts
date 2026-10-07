import { z } from "zod";
import type { Contribution, CritiqueSet, DirectReply, FinalAnswer, Interpretation, Reply } from "./types";

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
});

export const finalSchema = z.object({
  answer: s(10000),
  keyEvidence: evidence,
  uncertainty: list(500, 10),
  disagreements: list(500, 10),
  deliberationEffect: s(1500).catch(""),
  confidence: conf,
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
export const parseDirect = (t: string) => parseWith<DirectReply>(directSchema, t, (x) => ({ reply: x }));
