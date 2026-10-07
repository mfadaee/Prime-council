import { redactSecrets } from "@/lib/security/redact";
import { codeForStatus, ProviderError } from "./types";

/**
 * POST/GET JSON with a hard timeout and caller cancellation. Error messages are
 * redacted so a provider echoing a key back can never leak it into logs/events.
 */
export async function fetchJson<T>(
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; timeoutMs: number; signal: AbortSignal; secrets?: (string | null)[] },
): Promise<T> {
  const timeout = AbortSignal.timeout(init.timeoutMs);
  const signal = AbortSignal.any([init.signal, timeout]);
  const secrets = init.secrets ?? [];
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    });
  } catch (err) {
    if (init.signal.aborted) throw new ProviderError("cancelled", "Request cancelled");
    if (timeout.aborted) throw new ProviderError("timeout", `No response within ${init.timeoutMs} ms`);
    const msg = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
    throw new ProviderError("unavailable", redactSecrets(`Could not reach provider: ${msg}`, secrets));
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message ?? j?.message ?? j?.error ?? detail;
    } catch {
      /* keep raw */
    }
    throw new ProviderError(codeForStatus(res.status), redactSecrets(`HTTP ${res.status}: ${String(detail)}`, secrets), res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError("bad_response", "Provider returned non-JSON response");
  }
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}
