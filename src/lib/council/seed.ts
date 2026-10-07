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
  { id: "aurelia", name: "Aurelia", role: "chair", color: "#F5B942", monogram: "A", persona: "Calm and precise; keeps the Primes focused on the charter and on what the Founder actually asked." },
  { id: "quill", name: "Quill", role: "analyst", color: "#4CC3FF", monogram: "Q", persona: "Clear and structured; prefers a direct answer followed by the reasoning that supports it." },
  { id: "vex", name: "Vex", role: "skeptic", color: "#FF7A6B", monogram: "V", persona: "Fair-minded; challenges what is weak and acknowledges what is strong." },
  { id: "lumen", name: "Lumen", role: "researcher", color: "#3DDC97", monogram: "L", persona: "Careful with sources; distinguishes verified, likely and unverified claims." },
  { id: "forge", name: "Forge", role: "builder", color: "#B79CFF", monogram: "F", persona: "Practical; thinks in steps, costs and failure modes." },
  { id: "weave", name: "Weave", role: "synthesizer", color: "#FF8FCB", monogram: "W", persona: "Even-handed; writes the answer the evidence supports and names what remains open." },
];

/**
 * First-boot seat assignment: spread the Primes across every model family the
 * Founder configured (key/URL plus a model id), so the council is as diverse as
 * possible. Model ids come from the environment; only Anthropic has a default.
 * With nothing configured, every Prime starts on the labelled demo provider.
 */
export function modelFamilies(env: NodeJS.ProcessEnv = process.env): { providerId: string; model: string }[] {
  const v = (k: string) => env[k]?.trim() || "";
  const out: { providerId: string; model: string }[] = [];
  if (v("SIMLIFE_DEFAULT_PROVIDER") && v("SIMLIFE_DEFAULT_MODEL")) return [{ providerId: v("SIMLIFE_DEFAULT_PROVIDER"), model: v("SIMLIFE_DEFAULT_MODEL") }];
  if (v("ANTHROPIC_API_KEY")) out.push({ providerId: "anthropic", model: v("ANTHROPIC_MODEL") || "claude-opus-5-5" });
  if (v("OPENAI_API_KEY") && v("OPENAI_MODEL")) out.push({ providerId: "openai", model: v("OPENAI_MODEL") });
  if (v("GEMINI_API_KEY") && v("GEMINI_MODEL")) out.push({ providerId: "google", model: v("GEMINI_MODEL") });
  if (v("OLLAMA_MODEL")) out.push({ providerId: "ollama", model: v("OLLAMA_MODEL") });
  if (v("OPENAI_COMPAT_BASE_URL") && v("OPENAI_COMPAT_MODEL")) out.push({ providerId: "compat", model: v("OPENAI_COMPAT_MODEL") });
  return out.length ? out : [{ providerId: "demo", model: "demo-simulated" }];
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
    const families = modelFamilies();
    await db
      .insert(members)
      .values(DEFAULT_MEMBERS.map((m, i) => ({ ...m, seat: i, ...families[i % families.length], enabled: true })))
      .onConflictDoNothing();
  }
}
