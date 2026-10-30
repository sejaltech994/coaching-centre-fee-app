import { centres, invoices, payments, students, withCentre } from "@chukta/db";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { localDate } from "../../lib/dates";
import { invalidRequest } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const total = sql<number>`coalesce(sum(${invoices.amountPaise} + ${invoices.lateFeePaise}), 0)`.mapWith(Number);

/**
 * TSD: GET /dashboard/summary?month= — a month's money (collected, billed, still
 * owed), every overdue bill, and who owes it, most owed first.
 */
export function dashboardRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/summary", async (c) => {
    const { centreId } = c.var.auth;
    // Read before withCentre: the centre-scoped role can't read centres.
    const [centre] = await deps.db.select({ timezone: centres.timezone }).from(centres).where(eq(centres.id, centreId));
    const timezone = centre?.timezone ?? "Asia/Kolkata";
    const month = c.req.query("month") ?? localDate(timezone, deps.now()).slice(0, 7);
    if (!MONTH.test(month)) throw invalidRequest("Give the month as YYYY-MM.");
    const dueInMonth = sql`to_char(${invoices.dueDate}, 'YYYY-MM') = ${month}`;

    const summary = await withCentre(deps.db, centreId, async (tx) => {
      const [collected] = await tx
        .select({ paise: sql<number>`coalesce(sum(${payments.amountPaise}), 0)`.mapWith(Number) })
        .from(payments)
        .where(and(eq(payments.centreId, centreId), sql`to_char(${payments.receivedAt} at time zone ${timezone}, 'YYYY-MM') = ${month}`));
      const [billed] = await tx
        .select({ paise: total })
        .from(invoices)
        .where(and(eq(invoices.centreId, centreId), dueInMonth, ne(invoices.status, "waived")));
      const [outstanding] = await tx
        .select({ paise: total })
        .from(invoices)
        .where(and(eq(invoices.centreId, centreId), dueInMonth, inArray(invoices.status, ["pending", "overdue"])));
      const overdue = await tx
        .select({
          student: { id: students.id, name: students.name, parentName: students.parentName },
          invoiceId: invoices.id,
          dueDate: invoices.dueDate,
          paise: sql<number>`${invoices.amountPaise} + ${invoices.lateFeePaise}`.mapWith(Number),
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(and(eq(invoices.centreId, centreId), eq(invoices.status, "overdue")))
        .orderBy(asc(invoices.dueDate));
      return { collected: collected!.paise, billed: billed!.paise, outstanding: outstanding!.paise, overdue };
    });

    // Who owes: one row per student, most owed first.
    const byStudent = new Map<string, { student: (typeof summary.overdue)[number]["student"]; overduePaise: number; bills: number; oldestDueDate: string; invoiceIds: string[] }>();
    for (const bill of summary.overdue) {
      const row = byStudent.get(bill.student.id) ?? { student: bill.student, overduePaise: 0, bills: 0, oldestDueDate: bill.dueDate, invoiceIds: [] };
      row.overduePaise += bill.paise;
      row.bills += 1;
      row.invoiceIds.push(bill.invoiceId);
      byStudent.set(bill.student.id, row);
    }

    return c.json({
      month,
      collectedPaise: summary.collected,
      billedPaise: summary.billed,
      outstandingPaise: summary.outstanding,
      overduePaise: summary.overdue.reduce((sum, bill) => sum + bill.paise, 0),
      defaulters: [...byStudent.values()].sort((a, b) => b.overduePaise - a.overduePaise || a.oldestDueDate.localeCompare(b.oldestDueDate)),
    });
  });

  return routes;
}
