import { batches, centres, invoices, paymentSettings, students } from "@chukta/db";
import { upiPayLink } from "@chukta/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { ApiError } from "../../lib/errors";
import { findReceipt, pdfResponse, receiptData } from "../receipts/data";
import { renderReceipt } from "../receipts/pdf";

const TOKEN = /^[0-9a-f]{32}$/;
const notFound = () => new ApiError(404, "not_found", "This link isn't valid. Ask the centre for a new one.");

/**
 * What a parent sees from their pay link, without signing in. The token is the
 * only key; the page shows just enough to pay: no phone numbers, no other bills.
 * Payment goes from the parent's UPI app straight to the centre.
 */
export function publicRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();

  routes.get("/invoices/:token", async (c) => {
    const token = c.req.param("token");
    if (!TOKEN.test(token)) throw notFound();
    const [row] = await deps.db
      .select({ invoice: invoices, studentName: students.name, batchName: batches.name, centreName: centres.name, upi: paymentSettings })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .innerJoin(batches, eq(batches.id, invoices.batchId))
      .innerJoin(centres, eq(centres.id, invoices.centreId))
      .leftJoin(paymentSettings, eq(paymentSettings.centreId, invoices.centreId))
      .where(eq(invoices.publicToken, token));
    if (!row) throw notFound();
    const { invoice } = row;
    const totalPaise = invoice.amountPaise + invoice.lateFeePaise;
    const payable = invoice.status === "pending" || invoice.status === "overdue";
    const upi = payable && row.upi?.upiId && row.upi.payeeName ? { upiId: row.upi.upiId, payeeName: row.upi.payeeName } : null;

    return c.json({
      centre: { name: row.centreName },
      invoice: {
        number: invoice.number,
        studentName: row.studentName,
        batchName: row.batchName,
        cycle: invoice.cycle,
        periodStart: invoice.periodStart,
        dueDate: invoice.dueDate,
        totalPaise,
        lateFeePaise: invoice.lateFeePaise,
        status: invoice.status,
      },
      upi: upi && {
        ...upi,
        link: upiPayLink({ ...upi, amountPaise: totalPaise, note: `Bill #${invoice.number} ${row.studentName}` }),
      },
      receiptUrl: invoice.status === "paid" ? `/api/v1/public/receipts/${token}` : null,
    });
  });

  routes.get("/receipts/:token", async (c) => {
    const token = c.req.param("token");
    if (!TOKEN.test(token)) throw notFound();
    const row = await findReceipt(deps.db, eq(invoices.publicToken, token));
    if (!row) throw notFound();
    const data = await receiptData(deps.db, row);
    return pdfResponse(await renderReceipt(data), data.number);
  });

  return routes;
}
