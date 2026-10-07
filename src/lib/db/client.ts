/**
 * Database connection.
 *
 * - DATABASE_URL set  → PostgreSQL via node-postgres (docker compose provides one).
 * - DATABASE_URL unset → embedded PostgreSQL (PGlite) persisted under PGLITE_DIR,
 *   so `npm run dev` works with zero setup. Same SQL, same migrations.
 *
 * Migrations in ./drizzle are applied automatically on first use.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Holder = { db?: Promise<Db>; close?: () => Promise<void> };
const g = globalThis as unknown as { __simlifeDb?: Holder };
const holder: Holder = (g.__simlifeDb ??= {});

export function databaseMode(): "postgres" | "embedded" {
  return process.env.DATABASE_URL ? "postgres" : "embedded";
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzlePg({ client: pool, schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    holder.close = () => pool.end();
    return db as unknown as Db;
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  holder.close = () => client.close();
  return db as unknown as Db;
}

/** Shared connection for the server process (survives dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!holder.db) {
    holder.db = connect().catch((err) => {
      holder.db = undefined;
      throw err;
    });
  }
  return holder.db;
}

/** In-memory database for tests. Each call returns an isolated instance. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => client.close() };
}
