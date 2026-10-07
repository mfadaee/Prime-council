import { z } from "zod";
import { isAllowedKeyEnv } from "./registry";

export const providerInput = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use 2-40 lowercase letters, digits or dashes"),
  kind: z.enum(["openai", "anthropic", "google", "openai_compatible", "ollama"]),
  label: z.string().trim().min(1).max(60),
  baseUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "Base URL must be http(s)")
    .nullable()
    .optional(),
  apiKeyEnv: z
    .string()
    .trim()
    .refine(isAllowedKeyEnv, "Use an env var name ending in _API_KEY, _KEY or _TOKEN (e.g. OPENROUTER_API_KEY)")
    .nullable()
    .optional(),
  local: z.boolean().default(false),
});

export const providerPatch = providerInput.omit({ id: true, kind: true }).partial().extend({ enabled: z.boolean().optional(), local: z.boolean().optional() });
