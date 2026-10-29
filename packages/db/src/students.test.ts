import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { batches, centres, enrolments, students } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;
let centreA: string;
let centreB: string;
let batchA: string;

const student = (centreId: string, name = "Aarav Sharma") => ({
  centreId,
  name,
  parentName: "Neha Sharma",
  parentPhone: "+919876543210",
});

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db
    .insert(centres)
    .values([{ ownerPhone: "+919876543210" }, { ownerPhone: "+919123456789" }])
    .returning({ id: centres.id });
  [centreA, centreB] = rows.map((r) => r.id) as [string, string];
  const [batch] = await withCentre(db, centreA, (tx) =>
    tx
      .insert(batches)
      .values({ centreId: centreA, name: "Class 10 Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" })
      .returning(),
  );
  batchA = batch!.id;
});

const addStudent = (centreId = centreA, name?: string) =>
  withCentre(db, centreId, async (tx) => (await tx.insert(students).values(student(centreId, name)).returning())[0]!);

describe("students table", () => {
  it("starts a student active, without WhatsApp consent until the parent gives it", async () => {
    const row = await addStudent();
    expect(row).toMatchObject({ name: "Aarav Sharma", status: "active", whatsappOptIn: false, leftAt: null });
  });

  it.each([
    ["a blank name", { name: " " }],
    ["a blank parent name", { parentName: "" }],
    ["an unknown status", { status: "graduated" as never }],
  ])("rejects %s", async (_label, change) => {
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(students).values({ ...student(centreA), ...change })),
    ).rejects.toThrow();
  });
});

describe("enrolments table", () => {
  it("puts a student in a batch from a start date, with no fee plan yet", async () => {
    const s = await addStudent();
    const [row] = await withCentre(db, centreA, (tx) =>
      tx.insert(enrolments).values({ centreId: centreA, studentId: s.id, batchId: batchA, startDate: "2026-10-29" }).returning(),
    );
    expect(row).toMatchObject({ startDate: "2026-10-29", endDate: null, feePlanId: null, discountPaise: 0 });
  });

  it("allows one current enrolment per student and batch, but a new one after it ends", async () => {
    const s = await addStudent();
    const enrol = () =>
      withCentre(db, centreA, (tx) =>
        tx.insert(enrolments).values({ centreId: centreA, studentId: s.id, batchId: batchA, startDate: "2026-10-29" }).returning(),
      );
    const [first] = await enrol();
    await expect(enrol()).rejects.toThrow();

    await withCentre(db, centreA, (tx) => tx.update(enrolments).set({ endDate: "2026-11-30" }).where(eq(enrolments.id, first!.id)));
    await expect(enrol()).resolves.toBeDefined();
  });

  it("refuses an end before the start", async () => {
    const s = await addStudent();
    await expect(
      withCentre(db, centreA, (tx) =>
        tx.insert(enrolments).values({ centreId: centreA, studentId: s.id, batchId: batchA, startDate: "2026-10-29", endDate: "2026-10-01" }),
      ),
    ).rejects.toThrow();
  });
});

describe("row-level security", () => {
  it("shows a centre only its own students and enrolments, even with no WHERE", async () => {
    const s = await addStudent();
    await withCentre(db, centreA, (tx) =>
      tx.insert(enrolments).values({ centreId: centreA, studentId: s.id, batchId: batchA, startDate: "2026-10-29" }),
    );

    expect(await withCentre(db, centreB, (tx) => tx.select().from(students))).toEqual([]);
    expect(await withCentre(db, centreB, (tx) => tx.select().from(enrolments))).toEqual([]);
    expect(await withCentre(db, centreA, (tx) => tx.select().from(students))).toHaveLength(1);
  });

  it("stops a centre adding students or enrolments to another centre", async () => {
    await expect(withCentre(db, centreB, (tx) => tx.insert(students).values(student(centreA)))).rejects.toThrow();
    const s = await addStudent();
    await expect(
      withCentre(db, centreB, (tx) =>
        tx.insert(enrolments).values({ centreId: centreA, studentId: s.id, batchId: batchA, startDate: "2026-10-29" }),
      ),
    ).rejects.toThrow();
  });
});
