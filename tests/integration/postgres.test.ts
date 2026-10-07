import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

/**
 * Runs only when TEST_DATABASE_URL points at a disposable PostgreSQL database.
 * Verifies migrations and a full council session on real Postgres (not PGlite).
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PostgreSQL (node-postgres) backend", () => {
  afterAll(async () => {
    const g = globalThis as unknown as { __simlifeDb?: { close?: () => Promise<void> } };
    await g.__simlifeDb?.close?.();
  });

  it("migrates and runs a demo session end to end", async () => {
    process.env.DATABASE_URL = url;
    const { getDb } = await import("@/lib/db/client");
    const db = await getDb();
    await db.execute(sql`truncate council_sessions, session_events, contributions, usage_records, members, providers, settings restart identity`);
    const { startSession } = await import("@/lib/council/service");
    const { run, id } = await startSession(db, { question: "Integration check: is Postgres wired up?" });
    expect(await run.done).toBe("completed");
    const rows = await db.execute(sql`select status from council_sessions where id = ${id}`);
    expect((rows as unknown as { rows: { status: string }[] }).rows[0].status).toBe("completed");
  }, 60_000);
});
