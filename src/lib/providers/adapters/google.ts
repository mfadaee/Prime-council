import { fetchJson, joinUrl } from "../http";
import { ProviderError, type ProviderAdapter } from "../types";

/**
 * Gemini API (generativelanguage.googleapis.com v1beta):
 * POST models/{model}:generateContent with systemInstruction, contents,
 * generationConfig.maxOutputTokens. Verified against Google's API discovery document.
 */
interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

const DEFAULT_URL = "https://generativelanguage.googleapis.com/v1beta";

export const googleAdapter: ProviderAdapter = {
  kind: "google",
  isConfigured: (p) => Boolean(p.apiKey),
  async generate(p, req) {
    if (!p.apiKey) throw new ProviderError("not_configured", "Gemini API key is not set");
    const model = req.model.replace(/^models\//, "");
    const body = await fetchJson<GenerateContentResponse>(
      joinUrl(p.baseUrl ?? DEFAULT_URL, `models/${encodeURIComponent(model)}:generateContent`),
      {
        headers: { "x-goog-api-key": p.apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: req.maxOutputTokens },
        },
        timeoutMs: req.timeoutMs,
        signal: req.signal,
        secrets: [p.apiKey],
      },
    );
    if (body.promptFeedback?.blockReason) {
      throw new ProviderError("refused", `Request blocked (${body.promptFeedback.blockReason})`);
    }
    const cand = body.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    const u = body.usageMetadata;
    return {
      text,
      model: body.modelVersion ?? model,
      inputTokens: u?.promptTokenCount ?? null,
      // Thinking tokens are billed as output.
      outputTokens: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null,
      finishReason: cand?.finishReason ?? null,
    };
  },
  async listModels(p, signal) {
    if (!p.apiKey) throw new ProviderError("not_configured", "Gemini API key is not set");
    const body = await fetchJson<{ models?: { name: string; supportedGenerationMethods?: string[] }[] }>(
      joinUrl(p.baseUrl ?? DEFAULT_URL, "models?pageSize=200"),
      { headers: { "x-goog-api-key": p.apiKey }, timeoutMs: 10_000, signal, secrets: [p.apiKey] },
    );
    return (body.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort();
  },
};
