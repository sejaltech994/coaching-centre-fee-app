import { batches, invoices, payments, receipts, students, withCentre, type Invoice, type Payment, type Tx } from "@chukta/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, invalidRequest } from "../../lib/errors";
import { centreToday } from "../../lib/dates";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { recordPayment } from "../payments/record";
import { thankForPayment } from "../reminders/send";

/** Bills (TSD: invoices). They're made by billing.ts; here the owner lists, reads and waives them. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new ApiError(404, "not_found", "No such bill.");
const closed = () => new ApiError(409, "invoice_closed", "This bill is already paid or waived.");

type Row = {
  invoice: Invoice;
  student: { id: string; name: string; parentName: string };
  batch: { id: string; name: string };
  payment: Payment | null;
  receipt: { id: string; number: number } | null;
};

/** Where the parent opens a bill and pays it: the web app's /pay page. */
export const payLink = (deps: Deps, token: string) => `${deps.config.webOrigins[0]}/pay/?t=${token}`;

export function invoiceDto({ invoice, student, batch, payment, receipt }: Row, deps: Deps) {
  return {
    id: invoice.id,
    number: invoice.number,
    student,
    batch,
    cycle: invoice.cycle,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    dueDate: invoice.dueDate,
    amountPaise: invoice.amountPaise,
    discountPaise: invoice.discountPaise,
    lateFeePaise: invoice.lateFeePaise,
    totalPaise: invoice.amountPaise + invoice.lateFeePaise,
    status: invoice.status,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    waivedAt: invoice.waivedAt?.toISOString() ?? null,
    waiveReason: invoice.waiveReason,
    payment: payment && {
      method: payment.method,
      amountPaise: payment.amountPaise,
      reference: payment.reference,
      receivedAt: payment.receivedAt.toISOString(),
      receipt,
    },
    payLink: payLink(deps, invoice.publicToken),
    createdAt: invoice.createdAt.toISOString(),
  };
}

/** Bills with their student and batch names. */
export const withNames = (tx: Tx) =>
  tx
    .select({
      invoice: invoices,
      student: { id: students.id, name: students.name, parentName: students.parentName },
      batch: { id: batches.id, name: batches.name },
      payment: payments,
      receipt: { id: receipts.id, number: receipts.number },
    })
    .from(invoices)
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(batches, eq(batches.id, invoices.batchId))
    .leftJoin(payments, eq(payments.invoiceId, invoices.id))
    .leftJoin(receipts, eq(receipts.paymentId, payments.id));

const STATUSES = { unpaid: ["pending", "overdue"], all: null, pending: ["pending"], overdue: ["overdue"], paid: ["paid"], waived: ["waived"] } as const;

const listQuery = z.object({
  status: z.enum(Object.keys(STATUSES) as [keyof typeof STATUSES]).default("unpaid"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  batchId: z.string().regex(UUID).optional(),
  studentId: z.string().regex(UUID).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** Opaque keyset cursor: the sort key of the last bill on the page (newest due date first). */
const cursorShape = z.object({ d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), n: z.number().int() });
const encodeCursor = (row: Invoice) => Buffer.from(JSON.stringify({ d: row.dueDate, n: row.number })).toString("base64url");
function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    throw invalidRequest("The cursor is not valid.");
  }
}

const waiveBody = z.object({ reason: z.unknown() });
// The owner records UPI, cash or a bank transfer; cards and the rest come through the centre's gateway.
const paymentBody = z
  .object({
    method: z.enum(["upi", "cash", "bank_transfer"]),
    reference: z.string().max(100).optional(),
    receivedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export function invoiceRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("The query is not valid.");
    const { status, month, batchId, studentId, limit, cursor } = parsed.data;
    const after = cursor ? decodeCursor(cursor) : undefined;
    const statuses = STATUSES[status];
    const { centreId } = c.var.auth;

    const rows = await withCentre(deps.db, centreId, (tx) =>
      withNames(tx)
        .where(
          and(
            eq(invoices.centreId, centreId),
            statuses ? inArray(invoices.status, [...statuses]) : undefined,
            month ? sql`to_char(${invoices.dueDate}, 'YYYY-MM') = ${month}` : undefined,
            batchId ? eq(invoices.batchId, batchId) : undefined,
            studentId ? eq(invoices.studentId, studentId) : undefined,
            after ? sql`(${invoices.dueDate}, ${invoices.number}) < (${after.d}::date, ${after.n})` : undefined,
          ),
        )
        .orderBy(desc(invoices.dueDate), desc(invoices.number))
        .limit(limit + 1),
    );

    const page = rows.slice(0, limit);
    return c.json({
      invoices: page.map((row) => invoiceDto(row, deps)),
      nextCursor: rows.length > limit ? encodeCursor(page.at(-1)!.invoice) : null,
    });
  });

  routes.get("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const [row] = await withCentre(deps.db, centreId, (tx) =>
      withNames(tx).where(and(eq(invoices.id, id), eq(invoices.centreId, centreId))),
    );
    if (!row) throw notFound();
    return c.json({ invoice: invoiceDto(row, deps) });
  });

  /** TSD: waive an invoice with a reason; who and when are kept (money-changing actions are audited). */
  routes.post("/:id/waive", async (c) => {
    const { centreId, userId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const { reason } = await readJson(c, waiveBody);
    const why = typeof reason === "string" ? reason.trim() : "";
    if (!why) throw invalidFields({ reason: "Say why the fee is waived." });
    if (why.length > 200) throw invalidFields({ reason: "Keep the reason to 200 characters or fewer." });
    const now = deps.now();

    const row = await withCentre(deps.db, centreId, async (tx) => {
      const byId = and(eq(invoices.id, id), eq(invoices.centreId, centreId));
      const [current] = await tx.select({ status: invoices.status }).from(invoices).where(byId).for("update");
      if (!current) throw notFound();
      if (current.status !== "pending" && current.status !== "overdue") throw closed();
      await tx
        .update(invoices)
        .set({ status: "waived", waivedAt: now, waivedBy: userId, waiveReason: why, updatedAt: now })
        .where(byId);
      const [shown] = await withNames(tx).where(byId);
      return shown!;
    });
    return c.json({ invoice: invoiceDto(row, deps) });
  });

  /** TSD: record a cash (or UPI, or bank) payment. The bill is paid in full and gets a receipt. */
  routes.post("/:id/payments", async (c) => {
    const { centreId, userId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const { method, reference, receivedOn } = await readJson(c, paymentBody);
    const now = deps.now();
    const today = await centreToday(deps, centreId);
    if (receivedOn && receivedOn > today) throw invalidFields({ receivedOn: "The payment can’t be received in the future." });
    // A day in the past is recorded at noon in India, so it reads as that day everywhere.
    const receivedAt = !receivedOn || receivedOn === today ? now : new Date(`${receivedOn}T12:00:00+05:30`);

    const row = await withCentre(deps.db, centreId, async (tx) => {
      await recordPayment(tx, { centreId, invoiceId: id, method, reference: reference?.trim() || null, receivedAt, recordedBy: userId, now });
      const [shown] = await withNames(tx).where(and(eq(invoices.id, id), eq(invoices.centreId, centreId)));
      return shown!;
    });
    await thankForPayment(deps, centreId, id);
    return c.json({ invoice: invoiceDto(row, deps) }, 201);
  });

  return routes;
}
