import Anthropic from "@anthropic-ai/sdk";
import { redactSecrets } from "@/lib/security/redact";
import { ProviderError, type ProviderAdapter, type ResolvedProvider } from "../types";

/**
 * Anthropic Messages API via the official SDK. Retries are owned by the
 * orchestrator (bounded, budget-aware), so the SDK's own retries are disabled.
 *
 * For models that support it, the server-side refusal fallback ("default" routing)
 * is enabled so a safety decline is retried on a suitable model inside the same
 * call; the response's `model` field records which model actually answered.
 */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

function client(p: ResolvedProvider): Anthropic {
  return new Anthropic({ apiKey: p.apiKey ?? undefined, baseURL: p.baseUrl ?? undefined, maxRetries: 0 });
}

function mapError(err: unknown, p: ResolvedProvider, signal: AbortSignal): ProviderError {
  const msg = (e: Error) => redactSecrets(e.message, [p.apiKey]);
  if (err instanceof Anthropic.APIUserAbortError || signal.aborted) return new ProviderError("cancelled", "Request cancelled");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("timeout", "Anthropic request timed out");
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("unavailable", msg(err));
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new ProviderError("auth", msg(err), err.status);
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("rate_limited", msg(err), 429);
  if (err instanceof Anthropic.InternalServerError) return new ProviderError("unavailable", msg(err), err.status);
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    return new ProviderError(status === 529 ? "unavailable" : "bad_request", msg(err), status);
  }
  return new ProviderError("unknown", err instanceof Error ? msg(err) : String(err));
}

export const anthropicAdapter: ProviderAdapter = {
  kind: "anthropic",
  isConfigured: (p) => Boolean(p.apiKey),
  async generate(p, req) {
    if (!p.apiKey) throw new ProviderError("not_configured", "Anthropic API key is not set");
    const useFallback = FALLBACK_MODELS.has(req.model);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client(p).beta.messages.create(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: req.messages,
          ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal, timeout: req.timeoutMs },
      );
    } catch (err) {
      throw mapError(err, p, req.signal);
    }
    if (response.stop_reason === "refusal") {
      throw new ProviderError("refused", "The model declined this request");
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      finishReason: response.stop_reason ?? null,
    };
  },
  async listModels(p, signal) {
    if (!p.apiKey) throw new ProviderError("not_configured", "Anthropic API key is not set");
    try {
      const ids: string[] = [];
      for await (const m of client(p).models.list({ limit: 100 }, { signal, timeout: 10_000 })) ids.push(m.id);
      return ids;
    } catch (err) {
      throw mapError(err, p, signal);
    }
  },
};
