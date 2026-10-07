import type { CouncilRole } from "./types";

export interface RoleInfo {
  role: CouncilRole;
  title: string;
  summary: string;
  /** Prompt guidance. Describes focus, not attitude: no forced disagreement. */
  guidance: string;
  contributes: boolean; // gives an independent contribution
}

export const ROLES: Record<CouncilRole, RoleInfo> = {
  chair: {
    role: "chair",
    title: "Chair",
    summary: "Coordinates deliberation",
    guidance:
      "You coordinate. Interpret the Founder's request precisely: what is actually being asked, explicit and implied constraints, and what a good answer must contain. Stay neutral on the answer itself.",
    contributes: false,
  },
  analyst: {
    role: "analyst",
    title: "Analyst",
    summary: "Develops the main answer",
    guidance:
      "You develop the main answer. Be direct and complete, structure it around the success criteria, and state the assumptions it depends on.",
    contributes: true,
  },
  skeptic: {
    role: "skeptic",
    title: "Skeptic",
    summary: "Challenges assumptions and weak evidence",
    guidance:
      "You test reasoning. Look for unsupported claims, hidden assumptions and weak evidence. Challenge only where it matters; when something is well supported, say so plainly. Do not manufacture disagreement.",
    contributes: true,
  },
  researcher: {
    role: "researcher",
    title: "Researcher",
    summary: "Gathers and checks sources",
    guidance:
      "You care about evidence. Identify which claims need sources and supply ones you are confident exist. If you cannot verify something, say it is unverified. Never invent citations or URLs.",
    contributes: true,
  },
  builder: {
    role: "builder",
    title: "Builder",
    summary: "Assesses practical implementation",
    guidance:
      "You assess practicality: what it would take to act on the answer, concrete steps, effort, cost and risks. Flag ideas that sound good but would not work in practice.",
    contributes: true,
  },
  synthesizer: {
    role: "synthesizer",
    title: "Synthesizer",
    summary: "Produces the final response",
    guidance:
      "You write the final answer. Weigh arguments by evidence and reasoning quality, not by how many members agree — agreement between models that share training data or sources is not proof. Preserve real disagreement and uncertainty.",
    contributes: false,
  },
};

export const ROLE_ORDER: CouncilRole[] = ["chair", "analyst", "skeptic", "researcher", "builder", "synthesizer"];
