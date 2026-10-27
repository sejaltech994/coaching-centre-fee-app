import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { batches, centres } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;

const batch = (centreId: string, name = "Class 10 Maths") => ({
  centreId,
  name,
  subject: "Mathematics",
  days: ["mon", "wed"],
  startTime: "16:00",
  endTime: "17:30",
});

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db
    .insert(centres)
    .values([{ ownerPhone: "+919876543210" }, { ownerPhone: "+919123456789" }])
    .returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
});

describe("batches table", () => {
  it("stores a schedule and starts active", async () => {
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA)).returning());

    expect(row).toMatchObject({ name: "Class 10 Maths", days: ["mon", "wed"], isActive: true });
    expect(row!.startTime).toMatch(/^16:00/);
  });

  it("keeps active batch names unique per centre, ignoring case", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA, "Kathak juniors")));
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA, "kathak JUNIORS"))),
    ).rejects.toThrow();
  });

  it("lets another centre, or an archived batch, reuse a name", async () => {
    const [first] = await withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA)).returning());
    await withCentre(db, centreB, (tx) => tx.insert(batches).values(batch(centreB)));

    await withCentre(db, centreA, (tx) => tx.update(batches).set({ isActive: false }).where(eq(batches.id, first!.id)));
    await expect(withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA)))).resolves.toBeDefined();
  });

  it.each([
    ["no days", { days: [] }],
    ["an unknown day", { days: ["mon", "funday"] }],
    ["an end before the start", { startTime: "17:00", endTime: "16:00" }],
    ["a blank name", { name: "  " }],
  ])("rejects %s", async (_label, change) => {
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(batches).values({ ...batch(centreA), ...change })),
    ).rejects.toThrow();
  });
});

describe("row-level security", () => {
  beforeEach(async () => {
    await withCentre(db, centreA, (tx) => tx.insert(batches).values(batch(centreA, "A's batch")));
  });

  it("shows a centre only its own batches, even when a query has no WHERE", async () => {
    const seenByA = await withCentre(db, centreA, (tx) => tx.select().from(batches));
    const seenByB = await withCentre(db, centreB, (tx) => tx.select().from(batches));

    expect(seenByA.map((b) => b.name)).toEqual(["A's batch"]);
    expect(seenByB).toEqual([]);
  });

  it("stops a centre changing or deleting another centre's batches", async () => {
    const updated = await withCentre(db, centreB, (tx) => tx.update(batches).set({ name: "Hijacked" }).returning());
    const deleted = await withCentre(db, centreB, (tx) => tx.delete(batches).returning());

    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    expect((await withCentre(db, centreA, (tx) => tx.select().from(batches)))[0]!.name).toBe("A's batch");
  });

  it("stops a centre creating a batch for another centre", async () => {
    await expect(withCentre(db, centreB, (tx) => tx.insert(batches).values(batch(centreA, "Planted")))).rejects.toThrow();
  });

  it("shows nothing when no centre is set", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role chukta_app`);
      return tx.select().from(batches);
    });
    expect(rows).toEqual([]);
  });

  it("runs the transaction as the restricted role, scoped to the centre", async () => {
    const [scope] = await withCentre(
      db,
      centreA,
      async (tx) => {
        const result = await tx.execute(sql`select current_user as role, current_setting('app.centre_id') as centre`);
        return (result as unknown as { rows: { role: string; centre: string }[] }).rows;
      },
    );
    expect(scope).toEqual({ role: "chukta_app", centre: centreA });
  });

  it("does not leak the centre setting to the next transaction", async () => {
    await withCentre(db, centreA, (tx) => tx.select().from(batches));
    const setting = await db.execute(sql`select current_setting('app.centre_id', true) as centre`);
    expect([null, ""]).toContain((setting.rows[0] as { centre: string | null }).centre);
  });
});
