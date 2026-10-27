import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";
import { createLocalDb, runMigrations } from "./local";
import { centres, users } from "./schema";

describe("createLocalDb: embedded Postgres for local development", () => {
  it("keeps data in a folder across restarts, after migrations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chukta-pglite-"));
    try {
      const first = createLocalDb(`pglite:${dir}`);
      await runMigrations(first);
      await first.db.insert(centres).values({ ownerPhone: "+919876543210" });
      await first.close();

      const second = createLocalDb(`pglite:${dir}`);
      await runMigrations(second); // already applied: a no-op
      expect(await second.db.select().from(centres)).toHaveLength(1);
      await second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates the data folder on a fresh checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chukta-pglite-"));
    try {
      const handle = createLocalDb(`pglite:${join(dir, "not", "there", "yet")}`);
      await runMigrations(handle);
      expect(await handle.db.select().from(centres)).toEqual([]);
      await handle.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs in memory for pglite:memory", async () => {
    const handle = createLocalDb("pglite:memory");
    await runMigrations(handle);
    expect(await handle.db.select().from(users)).toEqual([]);
    await handle.close();
  });
});

describe("createDb with a Postgres URL", () => {
  it("points embedded-database URLs to createLocalDb", () => {
    expect(() => createDb("pglite:memory")).toThrow("createLocalDb");
  });

  it("builds a schema-aware client without connecting until the first query", async () => {
    // Nothing listens on port 1: creating the client must not try to connect.
    const { db, close } = createDb("postgres://user:pass@127.0.0.1:1/none");

    expect(db.query.users).toBeDefined();
    expect(db.select().from(users).toSQL().sql).toContain('from "users"');
    await expect(close()).resolves.toBeUndefined();
  });
});
