import type { ProviderKind } from "@/lib/council/types";

/** Resolved, server-side-only provider configuration (includes the secret). */
export interface ResolvedProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string | null;
  apiKey: string | null;
  local: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
  signal: AbortSignal;
  /** Hints used only by the demo adapter to produce labelled simulated output. */
  hint?: { phase: string; role: string; memberName: string; question: string; mode?: string; targets?: { id: string; name: string }[] };
}

export interface GenerateResult {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
}

export interface ProviderAdapter {
  kind: ProviderKind;
  /** True when the adapter has what it needs to attempt a call. */
  isConfigured(p: ResolvedProvider): boolean;
  generate(p: ResolvedProvider, req: GenerateRequest): Promise<GenerateResult>;
  listModels(p: ResolvedProvider, signal: AbortSignal): Promise<string[]>;
}

export type ProviderErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "bad_request"
  | "refused"
  | "cancelled"
  | "bad_response"
  | "unknown";

const RETRYABLE: ProviderErrorCode[] = ["rate_limited", "timeout", "unavailable"];

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;
  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
  get retryable(): boolean {
    return RETRYABLE.includes(this.code);
  }
}

export function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  if (status === 404) return "bad_request";
  return "bad_request";
}
