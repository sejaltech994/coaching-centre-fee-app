// Runs anywhere the API runs: Node and Cloudflare Workers (pg reaches Postgres over
// Workers' TCP sockets via pg-cloudflare). Node-only pieces live in ./local.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema: node-postgres in the app, PGlite in tests and local dev. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = { db: Database; close: () => Promise<void>; kind: "postgres" | "pglite" };

/**
 * Connects to a real Postgres server (`postgres://…`). Pass a small `max` where
 * each request gets its own pool, as in a Worker.
 */
export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  if (url.startsWith("pglite:")) {
    throw new Error("pglite: URLs are for local development; use createLocalDb from @chukta/db/local");
  }
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  return { db: drizzle(pool, { schema }), close: () => pool.end(), kind: "postgres" };
}

/** A transaction handle, as passed to withCentre's callback. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction scoped to one centre: as the restricted chukta_app
 * role, with app.centre_id set, so row-level security hides and protects every
 * other centre's rows even if a query forgets its WHERE. Both settings are
 * transaction-local and end with it.
 */
export async function withCentre<T>(db: Database, centreId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // One statement, so one round trip: set_config('role', …, true) is SET LOCAL ROLE.
    await tx.execute(sql`select set_config('app.centre_id', ${centreId}, true), set_config('role', 'chukta_app', true)`);
    return fn(tx);
  });
}
