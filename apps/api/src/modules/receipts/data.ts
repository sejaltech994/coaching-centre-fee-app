import { batches, centres, invoices, payments, receipts, students, type Database, type Tx } from "@chukta/db";
import { periodLabel } from "@chukta/shared";
import { eq, type SQL } from "drizzle-orm";
import { localDate } from "../../lib/dates";
import type { ReceiptData } from "./pdf";

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  netbanking: "Net banking",
  wallet: "Wallet",
};

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

type ReceiptRow = Awaited<ReturnType<typeof findReceipt>>;

/**
 * The receipt matching `where`, with its payment, bill and student. `db` is a
 * centre-scoped transaction for the owner, or the unscoped database for a
 * parent's pay link.
 */
export async function findReceipt(db: Database | Tx, where: SQL) {
  const [row] = await db
    .select({ receipt: receipts, payment: payments, invoice: invoices, student: students, batchName: batches.name })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(batches, eq(batches.id, invoices.batchId))
    .where(where);
  return row ?? null;
}

/**
 * What the receipt shows, adding the centre's own details. Call it outside any
 * centre-scoped transaction: that role can't read centres, and a second query
 * on a one-connection pool would wait for the transaction forever.
 */
export async function receiptData(db: Database, row: NonNullable<ReceiptRow>): Promise<ReceiptData> {
  const [centre] = await db.select().from(centres).where(eq(centres.id, row.receipt.centreId));
  const received = localDate(centre?.timezone ?? "Asia/Kolkata", row.payment.receivedAt);
  return {
    number: row.receipt.number,
    centre: { name: centre?.name ?? "Your coaching centre", city: centre?.city ?? null },
    student: row.student.name,
    parent: row.student.parentName,
    batch: row.batchName,
    period: periodLabel(row.invoice.cycle, row.invoice.periodStart),
    billNumber: row.invoice.number,
    amountPaise: row.payment.amountPaise,
    method: METHOD_LABELS[row.payment.method] ?? row.payment.method,
    reference: row.payment.reference,
    receivedOn: dayFormat.format(new Date(`${received}T00:00:00Z`)),
  };
}

export const pdfResponse = (bytes: Uint8Array, number: number) =>
  new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="receipt-${number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
