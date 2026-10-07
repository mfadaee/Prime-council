import { fetchJson, joinUrl } from "../http";
import { ProviderError, type ProviderAdapter } from "../types";

/** Ollama native API: POST /api/chat (stream:false), GET /api/tags. */
interface OllamaChat {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

const DEFAULT_URL = "http://localhost:11434";

export const ollamaAdapter: ProviderAdapter = {
  kind: "ollama",
  isConfigured: () => true, // defaults to localhost; availability comes from the live check
  async generate(p, req) {
    const body = await fetchJson<OllamaChat>(joinUrl(p.baseUrl ?? DEFAULT_URL, "api/chat"), {
      body: {
        model: req.model,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        stream: false,
        options: { num_predict: req.maxOutputTokens },
      },
      timeoutMs: req.timeoutMs,
      signal: req.signal,
    });
    return {
      text: body.message?.content ?? "",
      model: body.model ?? req.model,
      inputTokens: body.prompt_eval_count ?? null,
      outputTokens: body.eval_count ?? null,
      finishReason: body.done_reason ?? null,
    };
  },
  async listModels(p, signal) {
    const body = await fetchJson<{ models?: { name: string }[] }>(joinUrl(p.baseUrl ?? DEFAULT_URL, "api/tags"), {
      timeoutMs: 5_000,
      signal,
    });
    if (!body.models) throw new ProviderError("bad_response", "Unexpected /api/tags response");
    return body.models.map((m) => m.name).sort();
  },
};
