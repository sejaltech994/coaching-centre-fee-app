import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema: node-postgres in the app, PGlite in tests and local dev. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = { db: Database; close: () => Promise<void>; kind: "postgres" | "pglite" };

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * `postgres://…` connects to a real server. `pglite:<folder>` (or `pglite:memory`)
 * runs an embedded Postgres in-process, so local development needs no install.
 */
export function createDb(url: string): DbHandle {
  if (url.startsWith("pglite:")) {
    const location = url.slice("pglite:".length);
    // PGlite creates its own folder but not missing parents (e.g. a fresh checkout's .data/).
    if (location !== "memory") mkdirSync(location, { recursive: true });
    const client = location === "memory" ? new PGlite() : new PGlite(location);
    return {
      db: drizzlePglite(client, { schema }) as unknown as Database,
      close: () => client.close(),
      kind: "pglite",
    };
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return { db: drizzleNodePg(pool, { schema }), close: () => pool.end(), kind: "postgres" };
}

/** Applies any migrations not yet applied. Safe to run repeatedly. */
export async function runMigrations(handle: DbHandle): Promise<void> {
  if (handle.kind === "pglite") {
    await migratePglite(handle.db as unknown as Parameters<typeof migratePglite>[0], { migrationsFolder });
  } else {
    await migrateNodePg(handle.db as unknown as Parameters<typeof migrateNodePg>[0], { migrationsFolder });
  }
}
