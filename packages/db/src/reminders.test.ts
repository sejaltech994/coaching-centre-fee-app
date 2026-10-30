import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { batches, centres, enrolments, invoices, reminders, students } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;
let invoiceId: string;

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db.insert(centres).values([{}, {}]).returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
  invoiceId = await withCentre(db, centreA, async (tx) => {
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
    const [invoice] = await tx
      .insert(invoices)
      .values({
        centreId: centreA,
        studentId: student!.id,
        enrolmentId: enrolment!.id,
        batchId: batch!.id,
        number: 1,
        cycle: "monthly",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        dueDate: "2026-11-05",
        amountPaise: 250000,
      })
      .returning();
    return invoice!.id;
  });
});

const reminder = (extra: Partial<typeof reminders.$inferInsert> = {}) => ({
  centreId: centreA,
  invoiceId,
  kind: "due" as const,
  template: "chukta_fee_due_gentle_v1",
  templateVersion: 1,
  status: "sent" as const,
  ...extra,
});

describe("reminders table", () => {
  it("records a reminder against its bill, with the template it used", async () => {
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(reminders).values(reminder({ providerMessageId: "wamid.1" })).returning());
    expect(row).toMatchObject({ channel: "whatsapp", status: "sent", error: null, sentAt: null });
  });

  it("sends each scheduled reminder once per bill, but any number sent by hand", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(reminders).values(reminder()));
    await expect(withCentre(db, centreA, (tx) => tx.insert(reminders).values(reminder()))).rejects.toThrow();
    await withCentre(db, centreA, (tx) => tx.insert(reminders).values([reminder({ kind: "manual" }), reminder({ kind: "manual" })]));
  });

  it.each([
    ["an unknown kind", { kind: "weekly" as never }],
    ["an unknown status", { status: "lost" as never }],
  ])("rejects %s", async (_label, change) => {
    await expect(withCentre(db, centreA, (tx) => tx.insert(reminders).values(reminder(change)))).rejects.toThrow();
  });

  it("shows a centre only its own reminders", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(reminders).values(reminder()));
    expect(await withCentre(db, centreB, (tx) => tx.select().from(reminders))).toEqual([]);
  });
});

describe("centres.reminder_tone", () => {
  it("is gentle until the owner picks firm", async () => {
    const [centre] = await db.select().from(centres);
    expect(centre!.reminderTone).toBe("gentle");
    await expect(db.insert(centres).values({ reminderTone: "rude" as never })).rejects.toThrow();
  });
});
