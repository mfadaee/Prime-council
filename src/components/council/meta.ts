import type { CouncilRole, MemberState, MessageKind, Stance } from "@/lib/council/types";

/** Every state has a text label + glyph, never colour alone. */
export const STATE_META: Record<MemberState, { label: string; glyph: string; color: string; description: string }> = {
  idle: { label: "Idle", glyph: "·", color: "#8a92c4", description: "Waiting" },
  preparing: { label: "Preparing", glyph: "◌", color: "#5cc8ff", description: "Waiting on its model" },
  speaking: { label: "Speaking", glyph: "◉", color: "#ffd36e", description: "Publishing a contribution" },
  reviewing: { label: "Reviewing", glyph: "◎", color: "#c4a1ff", description: "Reading other members' contributions" },
  agreeing: { label: "Agreeing", glyph: "✓", color: "#4ade9a", description: "Broadly agrees" },
  challenging: { label: "Challenging", glyph: "!", color: "#ff8a5b", description: "Raised a material challenge" },
  blocked: { label: "Blocked", glyph: "■", color: "#ffc857", description: "Blocked by a limit or the model declined" },
  offline: { label: "Offline", glyph: "×", color: "#6b7299", description: "Unavailable or excluded" },
};

export const ROLE_META: Record<CouncilRole, { title: string; glyph: string }> = {
  chair: { title: "Chair", glyph: "♛" },
  analyst: { title: "Analyst", glyph: "◆" },
  skeptic: { title: "Skeptic", glyph: "?" },
  researcher: { title: "Researcher", glyph: "⌕" },
  builder: { title: "Builder", glyph: "⚒" },
  synthesizer: { title: "Synthesizer", glyph: "✦" },
};

export const KIND_LABEL: Record<MessageKind, string> = {
  interpretation: "Interpretation",
  system_map: "System map",
  experiment: "Experiment design",
  contribution: "Contribution",
  critique: "Critique",
  reply: "Reply",
  synthesis: "Synthesis",
  direct: "Direct reply",
};

export const STANCE_META: Record<Stance | "reply" | "prime", { label: string; color: string }> = {
  challenge: { label: "challenges", color: "#ff8a5b" },
  support: { label: "supports", color: "#4ade9a" },
  refine: { label: "refines", color: "#5cc8ff" },
  reply: { label: "replies to", color: "#c4a1ff" },
  prime: { label: "addresses", color: "#ffd36e" },
};

export const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openai_compatible: "OpenAI-compatible",
  ollama: "Ollama",
  demo: "Demo",
};
