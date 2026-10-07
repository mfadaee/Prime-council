import type { StoredEvent } from "./types";

/**
 * In-process pub/sub for live session events. Events are persisted first, then
 * published, so a subscriber that misses one can always recover it from the DB.
 */
type Listener = (e: StoredEvent) => void;
const g = globalThis as unknown as { __simlifeBus?: Map<string, Set<Listener>> };
const channels: Map<string, Set<Listener>> = (g.__simlifeBus ??= new Map());

export function subscribe(sessionId: string, fn: Listener): () => void {
  let set = channels.get(sessionId);
  if (!set) channels.set(sessionId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) channels.delete(sessionId);
  };
}

export function publish(sessionId: string, e: StoredEvent): void {
  for (const fn of channels.get(sessionId) ?? []) {
    try {
      fn(e);
    } catch {
      /* a broken subscriber must not break the run */
    }
  }
}
