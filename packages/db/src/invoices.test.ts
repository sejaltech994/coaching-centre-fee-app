import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { batches, centres, enrolments, invoices, students } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;
let bill: typeof invoices.$inferInsert;

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db.insert(centres).values([{}, {}]).returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
  bill = await withCentre(db, centreA, async (tx) => {
    const [batch] = await tx
      .insert(batches)
      .values({ centreId: centreA, name: "Class 10 Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" })
      .returning();
    const [student] = await tx
      .insert(students)
      .values({ centreId: centreA, name: "Aarav", parentName: "Neha", parentPhone: "+919876543210" })
      .returning();
    const [enrolment] = await tx
      .insert(enrolments)
      .values({ centreId: centreA, studentId: student!.id, batchId: batch!.id, startDate: "2026-11-02" })
      .returning();
    return {
      centreId: centreA,
      studentId: student!.id,
      enrolmentId: enrolment!.id,
      batchId: batch!.id,
      number: 1,
      cycle: "monthly" as const,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      dueDate: "2026-11-05",
      amountPaise: 250000,
    };
  });
});

describe("invoices table", () => {
  it("starts a bill pending, with no late fee, payment or waiver", async () => {
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(invoices).values(bill).returning());
    expect(row).toMatchObject({
      status: "pending",
      discountPaise: 0,
      lateFeePaise: 0,
      planLateFeePaise: null,
      paidAt: null,
      waivedAt: null,
      waiveReason: null,
    });
  });

  it("bills each enrolment once per period, and numbers bills once per centre", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(invoices).values(bill));
    await expect(withCentre(db, centreA, (tx) => tx.insert(invoices).values({ ...bill, number: 2 }))).rejects.toThrow();
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(invoices).values({ ...bill, periodStart: "2026-12-01", periodEnd: "2026-12-31" })),
    ).rejects.toThrow();
  });

  it.each([
    ["no amount", { amountPaise: 0 }],
    ["a negative late fee", { lateFeePaise: -1 }],
    ["an unknown status", { status: "lost" as never }],
    ["a period that ends before it starts", { periodEnd: "2026-10-31" }],
    ["a waiver with no reason", { status: "waived" as const, waivedAt: new Date() }],
    ["a paid bill with no payment time", { status: "paid" as const }],
  ])("rejects %s", async (_label, change) => {
    await expect(withCentre(db, centreA, (tx) => tx.insert(invoices).values({ ...bill, ...change }))).rejects.toThrow();
  });

  it("shows a centre only its own bills, and won't let it add to another's", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(invoices).values(bill));

    expect(await withCentre(db, centreB, (tx) => tx.select().from(invoices))).toEqual([]);
    await expect(withCentre(db, centreB, (tx) => tx.insert(invoices).values({ ...bill, number: 9 }))).rejects.toThrow();
  });
});
