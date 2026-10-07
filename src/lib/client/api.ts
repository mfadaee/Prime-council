"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: unknown,
  ) {
    super(message);
  }
}

/** Fetch wrapper: JSON in/out, CSRF header on writes, readable errors. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...(method === "GET" ? {} : { "x-simlife-request": "1" }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = (data as { issues?: { path: string; message: string }[] } | null)?.issues;
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, issues?.length ? `${msg}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}` : msg, data);
  }
  return data as T;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function formatTokens(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
