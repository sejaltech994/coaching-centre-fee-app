import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { centres, feePlans } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;

const monthly = (centreId: string) => ({
  centreId,
  name: "Class 10 monthly",
  amountPaise: 250000,
  cycle: "monthly" as const,
  dueDay: 5,
});

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db
    .insert(centres)
    .values([{ ownerPhone: "+919876543210" }, { ownerPhone: "+919123456789" }])
    .returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
});

describe("fee_plans table", () => {
  it("stores a plan, active and without a late fee unless given one", async () => {
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(feePlans).values(monthly(centreA)).returning());
    expect(row).toMatchObject({ amountPaise: 250000, cycle: "monthly", dueDay: 5, lateFeePaise: null, isActive: true });
  });

  it.each([
    ["no amount", { amountPaise: 0 }],
    ["an unknown cycle", { cycle: "weekly" as never }],
    ["a due day past the 28th", { dueDay: 31 }],
    ["a monthly plan with no due day", { dueDay: null }],
    ["a one-time fee with a due day", { cycle: "one_time" as const, dueDay: 5 }],
    ["a late fee with no number of days", { lateFeePaise: 10000 }],
    ["a late fee bigger than the fee", { lateFeePaise: 300000, lateFeeAfterDays: 7 }],
    ["a blank name", { name: " " }],
  ])("rejects %s", async (_label, change) => {
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(feePlans).values({ ...monthly(centreA), ...change })),
    ).rejects.toThrow();
  });

  it("shows a centre only its own plans, and won't let it add to another's", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(feePlans).values(monthly(centreA)));

    expect(await withCentre(db, centreB, (tx) => tx.select().from(feePlans))).toEqual([]);
    await expect(withCentre(db, centreB, (tx) => tx.insert(feePlans).values(monthly(centreA)))).rejects.toThrow();
  });
});
