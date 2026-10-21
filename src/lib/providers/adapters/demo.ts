import { ProviderError, type GenerateRequest, type ProviderAdapter } from "../types";

/**
 * Demo provider: no model is called. It returns clearly labelled simulated
 * output in the same structured format real members publish, so the full
 * pipeline (events, UI, persistence, controls) runs without API keys.
 *
 * It never invents facts, sources or numbers — the text describes what a real
 * member in that seat would do. Latency is simulated (deterministic per prompt).
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ANGLE: Record<string, string> = {
  chair: "frame the question and keep deliberation on track",
  analyst: "develop the main answer, structured around the Founder's success criteria",
  skeptic: "test the weakest assumptions and ask what evidence would change the conclusion",
  researcher: "identify which claims need sources and check them (research tools are not enabled in demo mode)",
  builder: "assess what it would take to act on the answer: steps, effort, risks",
  synthesizer: "combine the strongest supported points into one answer",
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError("cancelled", "Request cancelled"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ProviderError("cancelled", "Request cancelled"));
      },
      { once: true },
    );
  });
}

function short(q: string): string {
  const s = q.replace(/\s+/g, " ").trim();
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

/** Beyond the System placeholders: structure only, no claims. */
const DEMO_LEVEL: Record<string, "implementation" | "redesign" | "reframe"> = {
  analyst: "implementation",
  builder: "redesign",
  skeptic: "reframe",
  researcher: "reframe",
};
const DEMO_ALTERNATIVE: Record<string, { title: string; description: string; removes: string[] }> = {
  implementation: { title: "Improve the current approach", description: "Placeholder for a better way to run today's solution, keeping its goal and rules.", removes: ["A2"] },
  redesign: { title: "Rebuild from first principles", description: "Placeholder for the system rebuilt without its inherited rules, keeping only the real constraints.", removes: ["A2", "A3"] },
  reframe: { title: "Question the objective itself", description: "Placeholder for changing which problem is being solved, because the stated goal may be a proxy.", removes: ["A3"] },
};

export function demoOutput(req: GenerateRequest): unknown {
  const h = req.hint ?? { phase: "direct", role: "analyst", memberName: "Member", question: "" };
  const q = short(h.question);
  const seed = hash(`${h.phase}|${h.role}|${h.question}|${req.messages.at(-1)?.content.length ?? 0}`);
  const angle = ANGLE[h.role] ?? "contribute from its role";
  const targets = h.targets ?? [];
  const beyond = h.mode === "beyond";

  switch (h.phase) {
    case "map":
      return {
        restatement: `Simulated system map for: "${q}"`,
        constraints: ["Demo mode: no model was called, so this map makes no factual claims"],
        successCriteria: ["Assumptions classified", "Structurally different alternatives", "A falsifiable experiment"],
        currentSystem: "[Simulated] A real Chair would describe the existing system here: what it produces and why it exists.",
        produces: "[Simulated] What the current system produces.",
        whyExists: "[Simulated] Why the current system exists.",
        assumptions: [
          { statement: "[Simulated] A physical or logical limit a real model would identify", kind: "constraint", layer: "reality", basis: "Demo placeholder — no model was called", matters: true },
          { statement: "[Simulated] A human-made rule or success metric a real model would identify", kind: "convention", layer: "constructed", basis: "Demo placeholder — no model was called", matters: true },
          { statement: "[Simulated] A belief treated as true without evidence", kind: "uncertain", layer: "assumption", basis: "Demo placeholder — no model was called", matters: false },
        ],
        boundaries: ["[Simulated] A possibility the current framing excludes"],
        distortions: ["[Simulated] An incentive that may distort behaviour"],
      };
    case "experiment":
      return {
        justified: true,
        reason: "Demo placeholder showing where the experiment design appears.",
        alternativeId: null,
        hypothesis: "[Simulated] A real member would state a falsifiable hypothesis here.",
        expectedObservations: ["[Simulated] What would be observed if the hypothesis holds"],
        cost: "[Simulated] Cost estimate",
        risks: ["[Simulated] A risk of running the experiment"],
        successCriteria: ["[Simulated] Success criterion"],
        stopConditions: ["[Simulated] When to stop"],
        reversible: true,
      };
    case "interpret":
      return {
        restatement: `Simulated interpretation of the Founder's request: "${q}"`,
        constraints: [
          "Demo mode: no model was called, so this session makes no factual claims",
          "Answer the actual request directly and keep it concise",
        ],
        successCriteria: ["A direct answer", "Evidence or an explicit note that none was checked", "Stated uncertainty"],
      };
    case "independent": {
      const base = {
        answer: `[Simulated ${h.memberName}] A real model in this seat would ${angle} for: "${q}".`,
        rationale: "Demo placeholder — shows where this member's published rationale appears.",
        evidence: [],
        assumptions: [`Demo assumption ${(seed % 3) + 1}: details of the request are taken at face value`],
        confidence: 0.4 + ((seed % 40) / 100),
      };
      if (!beyond) return base;
      const level = DEMO_LEVEL[h.role] ?? "implementation";
      const alt = DEMO_ALTERNATIVE[level];
      return {
        ...base,
        frameCheck: { challenged: level === "reframe", reason: `[Simulated] Where a real ${h.role} would say whether the framing should be questioned.`, assumptions: [] },
        alternatives: [{ title: `[Simulated] ${alt.title}`, description: alt.description, level, removes: alt.removes, keeps: ["A1"] }],
      };
    }
    case "critique": {
      const target = targets[seed % Math.max(1, targets.length)];
      const stance = h.role === "skeptic" ? "challenge" : (["support", "refine", "challenge"] as const)[seed % 3];
      return {
        critiques: target
          ? [
              {
                targetMemberId: target.id,
                claim: `${target.name}'s main point`,
                stance,
                reason: `[Simulated] A real ${h.role} would ${stance === "challenge" ? "contest" : stance === "refine" ? "sharpen" : "back"} this point and say why.`,
                ...(stance === "challenge" ? { assumption: "[Simulated] the assumption being challenged", resolveBy: "[Simulated] the evidence that would settle it" } : {}),
                ...(beyond ? { alternativeId: `${target.id}#1`, escapesFraming: stance !== "challenge" } : {}),
              },
            ]
          : [],
        overall: stance === "challenge" ? "partly" : "agree",
      };
    }
    case "resolve":
      return {
        response: (["revise", "defend", "concede"] as const)[seed % 3],
        updatedAnswer: `[Simulated ${h.memberName}] Position after critique (no model was called).`,
        reason: "Demo placeholder showing how a member responds to a challenge.",
      };
    case "synthesize":
      return {
        answer: `[Simulated final answer] In demo mode no model was called, so there is no substantive answer to "${q}". Configure a provider in Settings to get a real council answer.`,
        keyEvidence: [],
        uncertainty: ["Everything in this session is simulated"],
        disagreements: [],
        deliberationEffect: "Demo: shows where the council explains how critique changed the initial answer.",
        confidence: 0,
        minorityViews: [],
        ...(beyond
          ? {
              learned: ["[Simulated] Where the council records what it now believes about the underlying assumptions"],
              nextQuestions: ["[Simulated] What a real council would investigate next"],
              conventionalIsBest: false,
              framingVerdict: "[Simulated] Whether the original framing held up.",
              proposedChanges: [],
            }
          : {}),
      };
    default:
      return { reply: `[Simulated ${h.memberName}] A real model would reply to your message here. No model was called.` };
  }
}

export const demoAdapter: ProviderAdapter = {
  kind: "demo",
  isConfigured: () => true,
  async generate(_p, req) {
    const latency = 450 + (hash(req.system + (req.messages.at(-1)?.content ?? "")) % 900);
    await sleep(latency, req.signal);
    const text = JSON.stringify(demoOutput(req));
    const inputChars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
    return { text, model: req.model, inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(text.length / 4), finishReason: "simulated" };
  },
  async listModels() {
    return ["demo-simulated"];
  },
};
