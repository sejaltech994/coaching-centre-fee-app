import { batches, centres, invoices, paymentLinks, paymentSettings, students, withCentre } from "@chukta/db";
import { periodLabel, upiPayLink } from "@chukta/shared";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { ApiError } from "../../lib/errors";
import { invoiceClosed } from "../payments/record";
import { centreRazorpay } from "../payments/razorpay";
import { payLink } from "../invoices/routes";
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
      // Cards, net banking and UPI through the centre's own Razorpay account.
      card: payable && Boolean(row.upi?.razorpayKeyId),
    });
  });

  /** The centre's Razorpay checkout for this bill: an open link for the current amount is reused. */
  routes.post("/invoices/:token/checkout", async (c) => {
    const token = c.req.param("token");
    if (!TOKEN.test(token)) throw notFound();
    const [row] = await deps.db
      .select({ invoice: invoices, student: students, batchName: batches.name })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .innerJoin(batches, eq(batches.id, invoices.batchId))
      .where(eq(invoices.publicToken, token));
    if (!row) throw notFound();
    const { invoice } = row;
    if (invoice.status !== "pending" && invoice.status !== "overdue") throw invoiceClosed();
    const keys = await centreRazorpay(deps, invoice.centreId);
    if (!keys) throw new ApiError(409, "gateway_not_connected", "This centre doesn't take card payments here. Pay by UPI instead.");

    const now = deps.now();
    const amountPaise = invoice.amountPaise + invoice.lateFeePaise;
    const url = await withCentre(deps.db, invoice.centreId, async (tx) => {
      const [open] = await tx
        .select()
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.invoiceId, invoice.id),
            eq(paymentLinks.status, "created"),
            eq(paymentLinks.amountPaise, amountPaise),
            or(isNull(paymentLinks.expiresAt), gt(paymentLinks.expiresAt, now)),
          ),
        )
        .orderBy(desc(paymentLinks.createdAt))
        .limit(1);
      if (open) return open.shortUrl;

      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const link = await deps.gateway.createPaymentLink(keys, {
        amountPaise,
        description: `Bill #${invoice.number} · ${row.student.name} · ${row.batchName} · ${periodLabel(invoice.cycle, invoice.periodStart)}`,
        // Unique per link on the centre's account, at most 40 characters.
        referenceId: `${invoice.id.slice(0, 8)}-${invoice.number}-${now.getTime().toString(36)}`,
        invoiceId: invoice.id,
        customer: { name: row.student.parentName, contact: row.student.parentPhone },
        callbackUrl: payLink(deps, token),
        expireBy: expiresAt,
      });
      await tx.insert(paymentLinks).values({
        centreId: invoice.centreId,
        invoiceId: invoice.id,
        gatewayLinkId: link.id,
        shortUrl: link.shortUrl,
        amountPaise,
        expiresAt,
        createdAt: now,
      });
      return link.shortUrl;
    });
    return c.json({ url });
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
