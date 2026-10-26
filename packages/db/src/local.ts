// Node-only helpers: the embedded database for local development, and migrations.
// Kept out of the main entry so the Cloudflare Worker bundle never includes them.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { createDb, type Database, type DbHandle } from "./client";
import * as schema from "./schema";

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * `pglite:<folder>` (or `pglite:memory`) runs an embedded Postgres in-process, so
 * local development needs no install. Anything else connects to a real server.
 */
export function createLocalDb(url: string): DbHandle {
  if (!url.startsWith("pglite:")) return createDb(url);
  const location = url.slice("pglite:".length);
  // PGlite creates its own folder but not missing parents (e.g. a fresh checkout's .data/).
  if (location !== "memory") mkdirSync(location, { recursive: true });
  const client = location === "memory" ? new PGlite() : new PGlite(location);
  return {
    db: drizzle(client, { schema }) as unknown as Database,
    close: () => client.close(),
    kind: "pglite",
  };
}

/** Applies any migrations not yet applied. Safe to run repeatedly. */
export async function runMigrations(handle: DbHandle): Promise<void> {
  if (handle.kind === "pglite") {
    await migratePglite(handle.db as unknown as Parameters<typeof migratePglite>[0], { migrationsFolder });
  } else {
    await migrateNodePg(handle.db as unknown as Parameters<typeof migrateNodePg>[0], { migrationsFolder });
  }
}
