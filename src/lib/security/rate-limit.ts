/** In-memory token-bucket rate limiter (single-process, local-first app). */
interface Bucket {
  tokens: number;
  updated: number;
}
const g = globalThis as unknown as { __simlifeBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__simlifeBuckets ??= new Map());

export interface RateRule {
  capacity: number;
  refillPerSec: number;
}

export const RULES = {
  /** Starting sessions / model-calling actions. */
  expensive: { capacity: 10, refillPerSec: 10 / 60 },
  /** Other writes. */
  write: { capacity: 60, refillPerSec: 1 },
  read: { capacity: 300, refillPerSec: 10 },
} satisfies Record<string, RateRule>;

export function take(key: string, rule: RateRule, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key) ?? { tokens: rule.capacity, updated: now };
  b.tokens = Math.min(rule.capacity, b.tokens + ((now - b.updated) / 1000) * rule.refillPerSec);
  b.updated = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { ok: true, retryAfterSec: 0 };
  }
  buckets.set(key, b);
  return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / rule.refillPerSec) };
}

export function resetRateLimits(): void {
  buckets.clear();
}
