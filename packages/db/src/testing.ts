import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { migrationsFolder } from "./local";
import * as schema from "./schema";

/**
 * A fresh in-memory Postgres with every migration applied. Real SQL, real
 * constraints, no Docker; each call is isolated, so tests can't leak into each other.
 */
export async function createTestDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
