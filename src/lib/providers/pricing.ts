import type { ProviderKind } from "@/lib/council/types";

/** USD per 1M tokens. All costs computed from this table are ESTIMATES. */
export interface Price {
  inputPerM: number;
  outputPerM: number;
}

/**
 * Built-in prices are limited to list prices we could verify when this was
 * written (Anthropic first-party API, checked 2026-09-25). Everything else is
 * unpriced until the Founder adds a price in Settings → Pricing.
 */
export const BUILTIN_PRICES: Record<string, Price> = {
  "anthropic:claude-fable-5-1": { inputPerM: 10, outputPerM: 50 },
  "anthropic:claude-opus-5-5": { inputPerM: 4, outputPerM: 20 },
  "anthropic:claude-opus-5": { inputPerM: 5, outputPerM: 25 },
  "anthropic:claude-sonnet-5-5": { inputPerM: 2, outputPerM: 10 },
  "anthropic:claude-sonnet-5": { inputPerM: 2, outputPerM: 10 },
  "anthropic:claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
};

export type PriceTable = Record<string, Price>;

/**
 * Lookup order: provider-instance override ("<providerId>:<model>"), kind-level
 * override or built-in ("<kind>:<model>"). Local and demo providers cost 0.
 */
export function priceFor(
  table: PriceTable,
  provider: { id: string; kind: ProviderKind; local: boolean },
  model: string,
): Price | null {
  if (provider.kind === "demo" || provider.local) return { inputPerM: 0, outputPerM: 0 };
  return table[`${provider.id}:${model}`] ?? table[`${provider.kind}:${model}`] ?? BUILTIN_PRICES[`${provider.kind}:${model}`] ?? null;
}

export function costUsd(price: Price | null, inputTokens: number, outputTokens: number): number | null {
  if (!price) return null;
  return (inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1_000_000;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
