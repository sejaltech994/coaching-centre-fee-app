import { invoices, payments, receipts, type Tx } from "@chukta/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "../../lib/errors";

export const invoiceClosed = () => new ApiError(409, "invoice_closed", "This bill is already paid or waived.");

export type PaymentMethod = (typeof payments.$inferInsert)["method"];

/**
 * Records a bill paid in full: the payment, the bill marked paid and the next
 * receipt number, in the caller's transaction (inside withCentre). Used by the
 * owner's "Record payment" and by gateway webhooks.
 */
export async function recordPayment(
  tx: Tx,
  input: {
    centreId: string;
    invoiceId: string;
    method: PaymentMethod;
    reference: string | null;
    receivedAt: Date;
    recordedBy: string | null;
    gatewayPaymentId?: string;
    now: Date;
  },
): Promise<void> {
  const byId = and(eq(invoices.id, input.invoiceId), eq(invoices.centreId, input.centreId));
  const [bill] = await tx.select().from(invoices).where(byId).for("update");
  if (!bill) throw new ApiError(404, "not_found", "No such bill.");
  if (bill.status !== "pending" && bill.status !== "overdue") throw invoiceClosed();

  const [payment] = await tx
    .insert(payments)
    .values({
      centreId: input.centreId,
      invoiceId: bill.id,
      amountPaise: bill.amountPaise + bill.lateFeePaise,
      method: input.method,
      reference: input.reference,
      gatewayPaymentId: input.gatewayPaymentId ?? null,
      receivedAt: input.receivedAt,
      recordedBy: input.recordedBy,
      createdAt: input.now,
    })
    .returning({ id: payments.id });
  await tx
    .update(invoices)
    .set({ status: "paid", paidAt: input.receivedAt, updatedAt: input.now })
    .where(and(byId, inArray(invoices.status, ["pending", "overdue"])));

  // Receipt numbers run 1, 2, 3… per centre: one numbering at a time.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`receipts:${input.centreId}`}))`);
  const [{ last }] = (await tx
    .select({ last: sql<number>`coalesce(max(${receipts.number}), 0)`.mapWith(Number) })
    .from(receipts)
    .where(eq(receipts.centreId, input.centreId))) as [{ last: number }];
  await tx.insert(receipts).values({ centreId: input.centreId, paymentId: payment!.id, number: last + 1, createdAt: input.now });
}
