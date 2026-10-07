/**
 * Spending guard. Before each model call we reserve its worst-case estimated
 * cost (estimated input + full max_output_tokens). A call is refused if the
 * reservation would push the session or daily total past its limit — this
 * accounts for calls running in parallel. After the call the reservation is
 * replaced by the actual (estimated-from-usage) cost.
 *
 * This bounds *starting* new work. It cannot claw back a request already in
 * flight at the provider, so it is not a hard billing cap.
 */
export interface BudgetLimits {
  sessionBudgetUsd: number;
  dailyBudgetUsd: number;
  allowUnpriced: boolean;
  /** Optional extra ceiling for a scope (e.g. background activity). */
  scopeDaily?: { spentUsd: number; limitUsd: number; label: string };
}

export type Reservation = { ok: true; id: number; amount: number } | { ok: false; reason: string };

export class BudgetGuard {
  private reserved = new Map<number, number>();
  private nextId = 1;
  sessionSpent: number;
  dailySpent: number;
  unpricedCalls = 0;

  constructor(
    private limits: BudgetLimits,
    sessionSpent: number,
    dailySpent: number,
  ) {
    this.sessionSpent = sessionSpent;
    this.dailySpent = dailySpent;
  }

  private get pending(): number {
    let n = 0;
    for (const v of this.reserved.values()) n += v;
    return n;
  }

  /** `estimate` null means the model has no configured price. */
  reserve(estimate: number | null): Reservation {
    if (estimate === null) {
      if (!this.limits.allowUnpriced) {
        return { ok: false, reason: "Model has no configured price, so spending limits cannot be enforced. Add a price in Settings or allow unpriced models." };
      }
      const id = this.nextId++;
      this.reserved.set(id, 0);
      return { ok: true, id, amount: 0 };
    }
    const after = this.pending + estimate;
    if (this.sessionSpent + after > this.limits.sessionBudgetUsd + 1e-12) {
      return { ok: false, reason: `Session budget ($${this.limits.sessionBudgetUsd.toFixed(2)}) would be exceeded` };
    }
    if (this.dailySpent + after > this.limits.dailyBudgetUsd + 1e-12) {
      return { ok: false, reason: `Daily budget ($${this.limits.dailyBudgetUsd.toFixed(2)}) would be exceeded` };
    }
    const sd = this.limits.scopeDaily;
    if (sd && sd.spentUsd + this.sessionSpent + after > sd.limitUsd + 1e-12) {
      return { ok: false, reason: `${sd.label} budget ($${sd.limitUsd.toFixed(2)}) would be exceeded` };
    }
    const id = this.nextId++;
    this.reserved.set(id, estimate);
    return { ok: true, id, amount: estimate };
  }

  /** Replace a reservation with the actual cost (null = unpriced). */
  settle(id: number, actual: number | null): void {
    this.reserved.delete(id);
    if (actual === null) {
      this.unpricedCalls++;
      return;
    }
    this.sessionSpent += actual;
    this.dailySpent += actual;
  }

  release(id: number): void {
    this.reserved.delete(id);
  }
}

/** Minimal async semaphore for bounded concurrency. */
export class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
