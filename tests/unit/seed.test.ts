import { describe, expect, it } from "vitest";
import { modelFamilies } from "@/lib/council/seed";

describe("Prime seat assignment", () => {
  it("falls back to the labelled demo provider when nothing is configured", () => {
    expect(modelFamilies({} as NodeJS.ProcessEnv)).toEqual([{ providerId: "demo", model: "demo-simulated" }]);
  });

  it("gives each configured model family its own Prime (round-robin)", () => {
    const f = modelFamilies({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", OPENAI_MODEL: "gpt-x", GEMINI_API_KEY: "k", OLLAMA_MODEL: "llama3.2" } as unknown as NodeJS.ProcessEnv);
    expect(f).toEqual([
      { providerId: "anthropic", model: "claude-opus-5-5" },
      { providerId: "openai", model: "gpt-x" },
      { providerId: "ollama", model: "llama3.2" },
    ]); // Gemini skipped: no model id configured, so none is guessed
  });
});
