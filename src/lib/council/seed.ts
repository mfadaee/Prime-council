import type { Db } from "@/lib/db/client";
import { members, providers } from "@/lib/db/schema";
import type { CouncilRole, ProviderKind } from "./types";

export const DEFAULT_PROVIDERS: {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string | null;
  apiKeyEnv: string | null;
  local: boolean;
}[] = [
  { id: "demo", kind: "demo", label: "Demo (simulated)", baseUrl: null, apiKeyEnv: null, local: true },
  { id: "anthropic", kind: "anthropic", label: "Anthropic", baseUrl: null, apiKeyEnv: "ANTHROPIC_API_KEY", local: false },
  { id: "openai", kind: "openai", label: "OpenAI", baseUrl: null, apiKeyEnv: "OPENAI_API_KEY", local: false },
  { id: "google", kind: "google", label: "Google Gemini", baseUrl: null, apiKeyEnv: "GEMINI_API_KEY", local: false },
  { id: "ollama", kind: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434", apiKeyEnv: null, local: true },
  {
    id: "compat",
    kind: "openai_compatible",
    label: "OpenAI-compatible endpoint",
    baseUrl: null,
    apiKeyEnv: "OPENAI_COMPAT_API_KEY",
    local: true,
  },
];

export const DEFAULT_MEMBERS: { id: string; name: string; role: CouncilRole; color: string; monogram: string; persona: string }[] = [
  { id: "aurelia", name: "Aurelia", role: "chair", color: "#F5B942", monogram: "A", persona: "Calm, precise, keeps the council focused on what the Prime actually asked." },
  { id: "quill", name: "Quill", role: "analyst", color: "#4CC3FF", monogram: "Q", persona: "Clear and structured; prefers a direct answer followed by the reasoning that supports it." },
  { id: "vex", name: "Vex", role: "skeptic", color: "#FF7A6B", monogram: "V", persona: "Fair-minded; challenges what is weak and acknowledges what is strong." },
  { id: "lumen", name: "Lumen", role: "researcher", color: "#3DDC97", monogram: "L", persona: "Careful with sources; distinguishes verified, likely and unverified claims." },
  { id: "forge", name: "Forge", role: "builder", color: "#B79CFF", monogram: "F", persona: "Practical; thinks in steps, costs and failure modes." },
  { id: "weave", name: "Weave", role: "synthesizer", color: "#FF8FCB", monogram: "W", persona: "Even-handed; writes the answer the evidence supports and names what remains open." },
];

/** First-boot model assignment: a configured provider if the Prime set one, else demo. */
function defaultAssignment(): { providerId: string; model: string } {
  const p = process.env.SIMLIFE_DEFAULT_PROVIDER?.trim();
  const m = process.env.SIMLIFE_DEFAULT_MODEL?.trim();
  if (p && m) return { providerId: p, model: m };
  if (process.env.ANTHROPIC_API_KEY?.trim()) return { providerId: "anthropic", model: "claude-opus-5-5" };
  return { providerId: "demo", model: "demo-simulated" };
}

export async function ensureSeeded(db: Db): Promise<void> {
  const existing = await db.select({ id: providers.id }).from(providers);
  const have = new Set(existing.map((r) => r.id));
  const missing = DEFAULT_PROVIDERS.filter((p) => !have.has(p.id)).map((p) => ({
    ...p,
    baseUrl: p.kind === "openai_compatible" ? (process.env.OPENAI_COMPAT_BASE_URL?.trim() || null) : p.kind === "ollama" ? (process.env.OLLAMA_BASE_URL?.trim() || p.baseUrl) : p.baseUrl,
  }));
  if (missing.length) await db.insert(providers).values(missing).onConflictDoNothing();

  const anyMember = await db.select({ id: members.id }).from(members).limit(1);
  if (!anyMember.length) {
    const a = defaultAssignment();
    await db
      .insert(members)
      .values(DEFAULT_MEMBERS.map((m, i) => ({ ...m, seat: i, providerId: a.providerId, model: a.model, enabled: true })))
      .onConflictDoNothing();
  }
}
