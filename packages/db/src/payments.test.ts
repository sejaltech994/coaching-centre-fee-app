import { beforeEach, describe, expect, it } from "vitest";
import { withCentre } from "./client";
import { batches, centres, enrolments, invoices, paymentLinks, payments, paymentSettings, receipts, students, webhookEvents } from "./schema";
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

const payment = (extra: Partial<typeof payments.$inferInsert> = {}) => ({
  centreId: centreA,
  invoiceId,
  amountPaise: 250000,
  method: "cash" as const,
  receivedAt: new Date(),
  ...extra,
});

describe("invoices.public_token", () => {
  it("gives every bill its own long, random token for the parent's pay link", async () => {
    const [bill] = await withCentre(db, centreA, (tx) => tx.select().from(invoices));
    expect(bill!.publicToken).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("payment_settings table", () => {
  it("keeps one row per centre, visible only to that centre", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(paymentSettings).values({ centreId: centreA, upiId: "sunrise@okicici", payeeName: "Sunrise Classes" }));
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(paymentSettings).values({ centreId: centreA, upiId: "other@ybl", payeeName: "x" })),
    ).rejects.toThrow();
    expect(await withCentre(db, centreB, (tx) => tx.select().from(paymentSettings))).toEqual([]);
  });
});

describe("payments and receipts tables", () => {
  it("records one payment per bill, with its receipt numbered per centre", async () => {
    const [paid] = await withCentre(db, centreA, (tx) => tx.insert(payments).values(payment()).returning());
    const [receipt] = await withCentre(db, centreA, (tx) =>
      tx.insert(receipts).values({ centreId: centreA, paymentId: paid!.id, number: 1 }).returning(),
    );

    expect(paid).toMatchObject({ method: "cash", reference: null, gatewayPaymentId: null });
    expect(receipt!.number).toBe(1);
    await expect(withCentre(db, centreA, (tx) => tx.insert(payments).values(payment()))).rejects.toThrow();
    await expect(
      withCentre(db, centreA, (tx) => tx.insert(receipts).values({ centreId: centreA, paymentId: paid!.id, number: 2 })),
    ).rejects.toThrow();
  });

  it.each([
    ["no amount", { amountPaise: 0 }],
    ["an unknown method", { method: "cheque" as never }],
  ])("rejects a payment with %s", async (_label, change) => {
    await expect(withCentre(db, centreA, (tx) => tx.insert(payments).values(payment(change)))).rejects.toThrow();
  });

  it("shows a centre only its own payments", async () => {
    await withCentre(db, centreA, (tx) => tx.insert(payments).values(payment()));
    expect(await withCentre(db, centreB, (tx) => tx.select().from(payments))).toEqual([]);
    await expect(withCentre(db, centreB, (tx) => tx.insert(payments).values(payment()))).rejects.toThrow();
  });
});

describe("the centre's own Razorpay account", () => {
  it("keeps its keys beside the UPI ID, the secrets only ever encrypted", async () => {
    const [row] = await withCentre(db, centreA, (tx) =>
      tx
        .insert(paymentSettings)
        .values({ centreId: centreA, razorpayKeyId: "rzp_test_abc", razorpayKeySecret: "v1.iv.ct", razorpayWebhookSecret: "v1.iv.ct2" })
        .returning(),
    );
    expect(row).toMatchObject({ upiId: null, razorpayKeyId: "rzp_test_abc" });
  });

  it("keeps one payment link per gateway link id, for a centre's own bills", async () => {
    const link = { centreId: centreA, invoiceId, gatewayLinkId: "plink_1", shortUrl: "https://rzp.io/i/a", amountPaise: 250000 };
    const [row] = await withCentre(db, centreA, (tx) => tx.insert(paymentLinks).values(link).returning());
    expect(row).toMatchObject({ status: "created", expiresAt: null });
    await expect(withCentre(db, centreA, (tx) => tx.insert(paymentLinks).values(link))).rejects.toThrow();
    expect(await withCentre(db, centreB, (tx) => tx.select().from(paymentLinks))).toEqual([]);
  });

  it("stores each webhook event once, by its source and id", async () => {
    const event = { source: "razorpay", eventId: "evt_1", centreId: centreA, payload: { event: "payment_link.paid" } };
    const [row] = await db.insert(webhookEvents).values(event).returning();
    expect(row).toMatchObject({ processedAt: null, payload: { event: "payment_link.paid" } });
    await expect(db.insert(webhookEvents).values(event)).rejects.toThrow();
    await expect(db.insert(webhookEvents).values({ ...event, source: "whatsapp" })).resolves.toBeDefined();
  });
});
