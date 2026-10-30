import { batches, centres, invoices, payments, receipts, students, withCentre } from "@chukta/db";
import { periodLabel, PLANS, toCsv } from "@chukta/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { localDate } from "../../lib/dates";
import { invalidRequest } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { centrePlan, planRequired } from "../subscription/routes";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const HEADINGS = ["Bill", "Student", "Parent", "Batch", "Period", "Due", "Amount (₹)", "Late fee (₹)", "Status", "Paid on", "Paid by", "Reference", "Receipt"];
const rupees = (paise: number) => (paise / 100).toFixed(2);

/** Pro's monthly report: every bill due that month and how it was paid, as a CSV for a spreadsheet. */
export function reportRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/monthly", async (c) => {
    const month = c.req.query("month") ?? "";
    if (!MONTH.test(month)) throw invalidRequest("Give the month as YYYY-MM.");
    const { centreId } = c.var.auth;
    if (!PLANS[await centrePlan(deps, centreId)].monthlyReports) throw planRequired("Monthly reports come with Pro.");
    const [centre] = await deps.db.select({ timezone: centres.timezone }).from(centres).where(eq(centres.id, centreId));
    const timezone = centre?.timezone ?? "Asia/Kolkata";

    const rows = await withCentre(deps.db, centreId, (tx) =>
      tx
        .select({ invoice: invoices, student: students, batchName: batches.name, payment: payments, receiptNumber: receipts.number })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(batches, eq(batches.id, invoices.batchId))
        .leftJoin(payments, eq(payments.invoiceId, invoices.id))
        .leftJoin(receipts, eq(receipts.paymentId, payments.id))
        .where(and(eq(invoices.centreId, centreId), sql`to_char(${invoices.dueDate}, 'YYYY-MM') = ${month}`))
        .orderBy(asc(invoices.number)),
    );

    const csv = toCsv([
      HEADINGS,
      ...rows.map(({ invoice, student, batchName, payment, receiptNumber }) => [
        String(invoice.number),
        student.name,
        student.parentName,
        batchName,
        periodLabel(invoice.cycle, invoice.periodStart),
        invoice.dueDate,
        rupees(invoice.amountPaise),
        rupees(invoice.lateFeePaise),
        invoice.status,
        payment ? localDate(timezone, payment.receivedAt) : "",
        payment?.method ?? "",
        payment?.reference ?? "",
        receiptNumber === null ? "" : String(receiptNumber),
      ]),
    ]);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="chukta-fees-${month}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  });

  return routes;
}
