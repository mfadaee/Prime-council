import { fetchJson, joinUrl } from "../http";
import { ProviderError, type ProviderAdapter } from "../types";

/**
 * Any server exposing OpenAI-style POST /chat/completions (vLLM, LM Studio,
 * llama.cpp server, OpenRouter, Ollama's /v1 ...). Uses `max_tokens`, which these
 * servers broadly accept; an API key is optional.
 */
interface ChatBody {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  kind: "openai_compatible",
  isConfigured: (p) => Boolean(p.baseUrl),
  async generate(p, req) {
    if (!p.baseUrl) throw new ProviderError("not_configured", "Base URL is not set");
    const headers: Record<string, string> = {};
    if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
    const body = await fetchJson<ChatBody>(joinUrl(p.baseUrl, "chat/completions"), {
      headers,
      body: {
        model: req.model,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        max_tokens: req.maxOutputTokens,
        stream: false,
      },
      timeoutMs: req.timeoutMs,
      signal: req.signal,
      secrets: [p.apiKey],
    });
    const choice = body.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (!text && choice?.message?.refusal) throw new ProviderError("refused", "The model declined this request");
    return {
      text,
      model: body.model ?? req.model,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      finishReason: choice?.finish_reason ?? null,
    };
  },
  async listModels(p, signal) {
    if (!p.baseUrl) throw new ProviderError("not_configured", "Base URL is not set");
    const headers: Record<string, string> = {};
    if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
    const body = await fetchJson<{ data?: { id: string }[] }>(joinUrl(p.baseUrl, "models"), {
      headers,
      timeoutMs: 10_000,
      signal,
      secrets: [p.apiKey],
    });
    return (body.data ?? []).map((m) => m.id).sort();
  },
};
