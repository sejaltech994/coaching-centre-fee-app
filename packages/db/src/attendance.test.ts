import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { attendance, batches, centres, students } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;
let mark: typeof attendance.$inferInsert;

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db.insert(centres).values([{}, {}]).returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
  mark = await withCentre(db, centreA, async (tx) => {
    const [batch] = await tx
      .insert(batches)
      .values({ centreId: centreA, name: "Class 10 Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" })
      .returning();
    const [student] = await tx
      .insert(students)
      .values({ centreId: centreA, name: "Aarav", parentName: "Neha", parentPhone: "+919876543210" })
      .returning();
    return { centreId: centreA, batchId: batch!.id, studentId: student!.id, date: "2026-11-02", present: false };
  });
});

describe("attendance table", () => {
  it("keeps one mark per student, batch and day, with no alert sent yet", async () => {
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(attendance).values(mark).returning());
    expect(row).toMatchObject({ present: false, alertedAt: null, alertError: null });
    await expect(withCentre(db, centreA, (tx) => tx.insert(attendance).values(mark))).rejects.toThrow();
    await withCentre(db, centreA, (tx) => tx.insert(attendance).values({ ...mark, date: "2026-11-03" }));
  });

  it("shows a centre only its own attendance", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(attendance).values(mark));
    expect(await withCentre(db, centreB, (tx) => tx.select().from(attendance))).toEqual([]);
    await expect(withCentre(db, centreB, (tx) => tx.insert(attendance).values({ ...mark, date: "2026-11-04" }))).rejects.toThrow();
  });
});

describe("centres.absence_alerts", () => {
  it("is off until the owner turns it on", async () => {
    const [centre] = await db.select().from(centres);
    expect(centre!.absenceAlerts).toBe(false);
  });
});
