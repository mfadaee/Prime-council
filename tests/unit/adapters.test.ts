import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { openaiAdapter } from "@/lib/providers/adapters/openai";
import { openaiCompatibleAdapter } from "@/lib/providers/adapters/openai-compatible";
import { googleAdapter } from "@/lib/providers/adapters/google";
import { ollamaAdapter } from "@/lib/providers/adapters/ollama";
import { ProviderError, type GenerateRequest, type ResolvedProvider } from "@/lib/providers/types";

/** A local HTTP server standing in for providers, so adapters are tested over real HTTP. */
let server: http.Server;
let base = "";
let last: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> } | null = null;
let reply: (url: string) => { status: number; body: unknown; delayMs?: number } = () => ({ status: 200, body: {} });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      last = { url: req.url ?? "", headers: req.headers, body: data ? JSON.parse(data) : {} };
      const r = reply(req.url ?? "");
      setTimeout(() => {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(JSON.stringify(r.body));
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  model: "m1",
  system: "SYS",
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 123,
  timeoutMs: 2000,
  signal: new AbortController().signal,
  ...over,
});
const prov = (kind: ResolvedProvider["kind"], path = ""): ResolvedProvider => ({ id: kind, kind, label: kind, baseUrl: base + path, apiKey: "sk-test-secret-123456789", local: false });

describe("OpenAI Responses adapter", () => {
  it("sends instructions/input/max_output_tokens with bearer auth and reads output_text + usage", async () => {
    reply = () => ({
      status: 200,
      body: { model: "m1", status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "Hi" }, { type: "output_text", text: "!" }] }], usage: { input_tokens: 11, output_tokens: 3 } },
    });
    const r = await openaiAdapter.generate(prov("openai", "/v1"), req());
    expect(last!.url).toBe("/v1/responses");
    expect(last!.headers.authorization).toBe("Bearer sk-test-secret-123456789");
    expect(last!.body).toMatchObject({ model: "m1", instructions: "SYS", max_output_tokens: 123 });
    expect(r).toMatchObject({ text: "Hi!", inputTokens: 11, outputTokens: 3 });
  });

  it("maps 429 to a retryable rate_limited error and redacts the key from messages", async () => {
    reply = () => ({ status: 429, body: { error: { message: "slow down sk-test-secret-123456789" } } });
    const err = await openaiAdapter.generate(prov("openai", "/v1"), req()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("rate_limited");
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain("sk-test-secret");
  });

  it("maps 401 to non-retryable auth", async () => {
    reply = () => ({ status: 401, body: { error: { message: "bad key" } } });
    const err = await openaiAdapter.generate(prov("openai", "/v1"), req()).catch((e) => e);
    expect(err.code).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("reports not_configured without a key", async () => {
    const err = await openaiAdapter.generate({ ...prov("openai"), apiKey: null }, req()).catch((e) => e);
    expect(err.code).toBe("not_configured");
  });
});

describe("OpenAI-compatible adapter", () => {
  it("posts chat/completions with a system message and reads usage", async () => {
    reply = () => ({ status: 200, body: { choices: [{ message: { content: "yo" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } } });
    const r = await openaiCompatibleAdapter.generate(prov("openai_compatible", "/v1"), req());
    expect(last!.url).toBe("/v1/chat/completions");
    expect((last!.body.messages as { role: string }[])[0]).toEqual({ role: "system", content: "SYS" });
    expect(last!.body.max_tokens).toBe(123);
    expect(r).toMatchObject({ text: "yo", inputTokens: 5, outputTokens: 2 });
  });

  it("times out slow servers", async () => {
    reply = () => ({ status: 200, body: {}, delayMs: 500 });
    const err = await openaiCompatibleAdapter.generate(prov("openai_compatible"), req({ timeoutMs: 100 })).catch((e) => e);
    expect(err.code).toBe("timeout");
  });

  it("propagates caller cancellation as cancelled", async () => {
    reply = () => ({ status: 200, body: {}, delayMs: 500 });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 50);
    const err = await openaiCompatibleAdapter.generate(prov("openai_compatible"), req({ signal: ctl.signal })).catch((e) => e);
    expect(err.code).toBe("cancelled");
  });

  it("reports an unreachable server as unavailable", async () => {
    const err = await openaiCompatibleAdapter.generate({ ...prov("openai_compatible"), baseUrl: "http://127.0.0.1:9" }, req()).catch((e) => e);
    expect(err.code).toBe("unavailable");
  });
});

describe("Gemini adapter", () => {
  it("calls models/{model}:generateContent with x-goog-api-key and skips thought parts", async () => {
    reply = () => ({
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "Answer" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 5 },
      },
    });
    const r = await googleAdapter.generate(prov("google", "/v1beta"), req({ model: "models/gem-x" }));
    expect(last!.url).toBe("/v1beta/models/gem-x:generateContent");
    expect(last!.headers["x-goog-api-key"]).toBe("sk-test-secret-123456789");
    expect(last!.body).toMatchObject({ systemInstruction: { parts: [{ text: "SYS" }] }, generationConfig: { maxOutputTokens: 123 } });
    expect(r).toMatchObject({ text: "Answer", inputTokens: 7, outputTokens: 7 });
  });

  it("treats a blocked prompt as refused", async () => {
    reply = () => ({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } });
    const err = await googleAdapter.generate(prov("google"), req()).catch((e) => e);
    expect(err.code).toBe("refused");
  });
});

describe("Ollama adapter", () => {
  it("posts /api/chat with stream:false and num_predict, and lists /api/tags", async () => {
    reply = (url) =>
      url === "/api/tags"
        ? { status: 200, body: { models: [{ name: "llama3.2:latest" }] } }
        : { status: 200, body: { model: "llama3.2", message: { role: "assistant", content: "hey" }, done: true, prompt_eval_count: 26, eval_count: 9 } };
    const r = await ollamaAdapter.generate({ ...prov("ollama"), apiKey: null }, req());
    expect(last!.url).toBe("/api/chat");
    expect(last!.body).toMatchObject({ stream: false, options: { num_predict: 123 } });
    expect(r).toMatchObject({ text: "hey", inputTokens: 26, outputTokens: 9 });
    expect(await ollamaAdapter.listModels({ ...prov("ollama"), apiKey: null }, new AbortController().signal)).toEqual(["llama3.2:latest"]);
  });
});
