import { fetchJson, joinUrl } from "../http";
import { ProviderError, type ProviderAdapter } from "../types";

/** OpenAI Responses API: POST /v1/responses (instructions + input + max_output_tokens). */
interface ResponsesBody {
  model?: string;
  status?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  incomplete_details?: { reason?: string } | null;
}

export const openaiAdapter: ProviderAdapter = {
  kind: "openai",
  isConfigured: (p) => Boolean(p.apiKey),
  async generate(p, req) {
    if (!p.apiKey) throw new ProviderError("not_configured", "OpenAI API key is not set");
    const base = p.baseUrl ?? "https://api.openai.com/v1";
    const transcript = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const body = await fetchJson<ResponsesBody>(joinUrl(base, "responses"), {
      headers: { authorization: `Bearer ${p.apiKey}` },
      body: { model: req.model, instructions: req.system, input: transcript, max_output_tokens: req.maxOutputTokens, store: false },
      timeoutMs: req.timeoutMs,
      signal: req.signal,
      secrets: [p.apiKey],
    });
    const text = (body.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("");
    const refusal = (body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "refusal");
    if (!text && refusal) throw new ProviderError("refused", "The model declined this request");
    return {
      text,
      model: body.model ?? req.model,
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
      finishReason: body.incomplete_details?.reason ?? body.status ?? null,
    };
  },
  async listModels(p, signal) {
    if (!p.apiKey) throw new ProviderError("not_configured", "OpenAI API key is not set");
    const body = await fetchJson<{ data?: { id: string }[] }>(joinUrl(p.baseUrl ?? "https://api.openai.com/v1", "models"), {
      headers: { authorization: `Bearer ${p.apiKey}` },
      timeoutMs: 10_000,
      signal,
      secrets: [p.apiKey],
    });
    return (body.data ?? []).map((m) => m.id).sort();
  },
};
