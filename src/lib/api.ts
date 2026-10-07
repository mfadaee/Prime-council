import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/council/seed";
import { RULES, take, type RateRule } from "@/lib/security/rate-limit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init.headers } });
}

function clientKey(req: Request): string {
  // Local-first: one Prime. Behind a proxy, the forwarded address separates clients.
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

/**
 * Wrap a route handler: rate limiting, CSRF defence for writes, JSON errors.
 * Writes must carry `x-simlife-request: 1` (a custom header browsers will not
 * send cross-site without a CORS preflight, which this app never grants).
 */
export function route<C>(
  handler: (req: Request, ctx: C, db: Db) => Promise<Response>,
  opts: { rate?: RateRule | keyof typeof RULES } = {},
) {
  return async (req: Request, ctx: C): Promise<Response> => {
    await connection(); // API responses are always computed at request time
    try {
      const write = req.method !== "GET" && req.method !== "HEAD";
      if (write && req.headers.get("x-simlife-request") !== "1") {
        throw new HttpError(403, "Missing x-simlife-request header");
      }
      const rule = typeof opts.rate === "string" ? RULES[opts.rate] : (opts.rate ?? (write ? RULES.write : RULES.read));
      const r = take(`${clientKey(req)}:${typeof opts.rate === "string" ? opts.rate : write ? "write" : "read"}`, rule);
      if (!r.ok) throw new HttpError(429, "Too many requests — slow down.", { retryAfterSec: r.retryAfterSec });
      const db = await getDb();
      await ensureSeeded(db);
      return await handler(req, ctx, db);
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return json({ error: err.message, ...err.extra }, { status: err.status, headers: err.status === 429 ? { "retry-after": String(err.extra.retryAfterSec ?? 10) } : {} });
      }
      if (err instanceof z.ZodError) {
        return json({ error: "Invalid input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      console.error("[api]", err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (cause: ${err.cause.message})` : ""}` : err);
      return json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 256 * 1024) throw new HttpError(413, "Request too large");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(raw);
}

export type IdCtx = { params: Promise<{ id: string }> };
