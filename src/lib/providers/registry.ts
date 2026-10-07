import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import type { ProviderKind, ProviderStatus } from "@/lib/council/types";
import { anthropicAdapter } from "./adapters/anthropic";
import { demoAdapter } from "./adapters/demo";
import { googleAdapter } from "./adapters/google";
import { ollamaAdapter } from "./adapters/ollama";
import { openaiAdapter } from "./adapters/openai";
import { openaiCompatibleAdapter } from "./adapters/openai-compatible";
import type { ProviderAdapter, ResolvedProvider } from "./types";

export const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openai_compatible: openaiCompatibleAdapter,
  ollama: ollamaAdapter,
  demo: demoAdapter,
};

export type ProviderRow = typeof providers.$inferSelect;

/** Environment variable names a provider may read its key from. */
export const API_KEY_ENV_PATTERN = /^[A-Z][A-Z0-9_]{1,60}_(API_KEY|KEY|TOKEN)$/;
const FORBIDDEN_ENV = new Set(["SIMLIFE_ACCESS_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]);

export function isAllowedKeyEnv(name: string): boolean {
  return API_KEY_ENV_PATTERN.test(name) && !FORBIDDEN_ENV.has(name);
}

export function resolveProvider(row: ProviderRow): ResolvedProvider {
  const keyEnv = row.apiKeyEnv && isAllowedKeyEnv(row.apiKeyEnv) ? row.apiKeyEnv : null;
  const apiKey = keyEnv ? process.env[keyEnv]?.trim() || null : null;
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    label: row.label,
    baseUrl: row.baseUrl,
    apiKey,
    local: row.local,
  };
}

export function providerStatus(row: ProviderRow): ProviderStatus {
  if (!row.enabled) return "disabled";
  if (row.kind === "demo") return "demo";
  const adapter = ADAPTERS[row.kind as ProviderKind];
  if (!adapter || !adapter.isConfigured(resolveProvider(row))) return "not_configured";
  if (row.lastCheckStatus === "available") return "available";
  if (row.lastCheckStatus === "unavailable") return "unavailable";
  return "configured";
}

/** Client-safe view: never includes key values, only whether the key is set. */
export function publicProvider(row: ProviderRow) {
  const r = resolveProvider(row);
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    label: row.label,
    baseUrl: row.baseUrl,
    apiKeyEnv: row.apiKeyEnv,
    keyPresent: Boolean(r.apiKey),
    local: row.local,
    enabled: row.enabled,
    status: providerStatus(row),
    lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
    lastCheckDetail: row.lastCheckDetail,
    models: row.models,
  };
}
export type PublicProvider = ReturnType<typeof publicProvider>;

/** Live check: list models. Records the outcome; never throws. */
export async function checkProvider(db: Db, row: ProviderRow): Promise<ProviderRow> {
  const adapter = ADAPTERS[row.kind as ProviderKind];
  const resolved = resolveProvider(row);
  let status: string;
  let detail: string;
  let models = row.models;
  if (!adapter.isConfigured(resolved)) {
    status = "not_configured";
    detail = row.kind === "openai_compatible" ? "Base URL is not set" : `Set ${row.apiKeyEnv ?? "an API key"} in .env.local`;
  } else {
    try {
      models = await adapter.listModels(resolved, AbortSignal.timeout(12_000));
      status = "available";
      detail = row.kind === "demo" ? "Simulated provider" : `${models.length} models listed`;
    } catch (err) {
      status = "unavailable";
      detail = err instanceof Error ? err.message : String(err);
    }
  }
  const [updated] = await db
    .update(providers)
    .set({ lastCheckAt: new Date(), lastCheckStatus: status, lastCheckDetail: detail.slice(0, 300), models, updatedAt: new Date() })
    .where(eq(providers.id, row.id))
    .returning();
  return updated;
}
