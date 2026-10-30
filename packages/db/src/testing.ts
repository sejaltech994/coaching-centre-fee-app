import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { migrationsFolder } from "./local";
import * as schema from "./schema";

// The migrations run once per test worker; each test then starts from a copy of
// that migrated database, which is far cheaper than migrating again.
let template: Promise<Blob> | null = null;
const open: PGlite[] = [];

async function migratedTemplate(): Promise<Blob> {
  const pg = new PGlite();
  await migrate(drizzle(pg, { schema }), { migrationsFolder });
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  return dump;
}

/**
 * A fresh in-memory Postgres with every migration applied. Real SQL, real
 * constraints, no Docker; each call is isolated, so tests can't leak into each other.
 */
export async function createTestDb() {
  template ??= migratedTemplate();
  const pg = await PGlite.create({ loadDataDir: await template });
  open.push(pg);
  return drizzle(pg, { schema });
}

/** Closes every test database made so far; the test setup calls it after each test. */
export async function closeTestDbs(): Promise<void> {
  const all = open.splice(0);
  await Promise.all(all.map((pg) => pg.close().catch(() => undefined)));
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
