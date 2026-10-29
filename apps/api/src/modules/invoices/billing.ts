import { enrolments, feePlans, invoices, type Tx } from "@chukta/db";
import { periodsToBill } from "@chukta/shared";
import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

/**
 * Creates the bills each enrolment should have by `today` (TSD: generate-invoices):
 * this period's and any starting within a week, at the plan's fee less the
 * discount. Safe to run again: a period already billed is skipped. Runs inside
 * withCentre; `enrolmentIds` limits it to just-made enrolments.
 */
export async function billEnrolments(
  tx: Tx,
  input: { centreId: string; today: string; now: Date; enrolmentIds?: string[] },
): Promise<number> {
  const { centreId, today, now } = input;
  const rows = await tx
    .select({ enrolment: enrolments, plan: feePlans })
    .from(enrolments)
    .innerJoin(feePlans, eq(feePlans.id, enrolments.feePlanId))
    .where(
      and(
        eq(enrolments.centreId, centreId),
        or(isNull(enrolments.endDate), sql`${enrolments.endDate} >= ${today}`),
        input.enrolmentIds ? inArray(enrolments.id, input.enrolmentIds) : undefined,
      ),
    )
    .orderBy(enrolments.createdAt, enrolments.id);
  if (rows.length === 0) return 0;

  const billed = await tx
    .select({ enrolmentId: invoices.enrolmentId, periodStart: invoices.periodStart })
    .from(invoices)
    .where(inArray(invoices.enrolmentId, rows.map((r) => r.enrolment.id)));
  const done = new Set(billed.map((b) => `${b.enrolmentId}:${b.periodStart}`));

  const bills = rows.flatMap(({ enrolment, plan }) => {
    const amountPaise = plan.amountPaise - enrolment.discountPaise;
    if (amountPaise <= 0) return [];
    return periodsToBill(plan, enrolment, today)
      .filter((period) => !done.has(`${enrolment.id}:${period.start}`))
      .map((period) => ({
        centreId,
        studentId: enrolment.studentId,
        enrolmentId: enrolment.id,
        batchId: enrolment.batchId,
        cycle: plan.cycle,
        periodStart: period.start,
        periodEnd: period.end,
        dueDate: period.dueDate,
        amountPaise,
        discountPaise: enrolment.discountPaise,
        planLateFeePaise: plan.lateFeePaise,
        planLateFeeAfterDays: plan.lateFeeAfterDays,
        createdAt: now,
      }));
  });
  if (bills.length === 0) return 0;

  // Numbers run 1, 2, 3… per centre: one numbering at a time, until this transaction ends.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoices:${centreId}`}))`);
  const [{ last }] = (await tx
    .select({ last: sql<number>`coalesce(max(${invoices.number}), 0)`.mapWith(Number) })
    .from(invoices)
    .where(eq(invoices.centreId, centreId))) as [{ last: number }];
  await tx.insert(invoices).values(bills.map((bill, i) => ({ ...bill, number: last + i + 1 })));
  return bills.length;
}

/**
 * Unpaid bills past their due date become overdue, and those past the plan's
 * grace days get its late fee, once (TSD: mark-overdue). Runs inside withCentre.
 */
export async function markOverdue(tx: Tx, input: { today: string; now: Date }): Promise<void> {
  const { today, now } = input;
  await tx
    .update(invoices)
    .set({ status: "overdue", updatedAt: now })
    .where(and(eq(invoices.status, "pending"), sql`${invoices.dueDate} < ${today}`));
  await tx
    .update(invoices)
    .set({ lateFeePaise: sql`${invoices.planLateFeePaise}`, updatedAt: now })
    .where(
      and(
        eq(invoices.status, "overdue"),
        eq(invoices.lateFeePaise, 0),
        isNotNull(invoices.planLateFeePaise),
        sql`${invoices.dueDate} + ${invoices.planLateFeeAfterDays} < ${today}::date`,
      ),
    );
}

/** A student left a batch on `endDate`: unpaid bills for periods after it go. */
export async function dropBillsAfter(tx: Tx, input: { enrolmentIds: string[]; endDate: string }): Promise<void> {
  if (input.enrolmentIds.length === 0) return;
  await tx
    .delete(invoices)
    .where(
      and(
        inArray(invoices.enrolmentId, input.enrolmentIds),
        inArray(invoices.status, ["pending", "overdue"]),
        gt(invoices.periodStart, input.endDate),
      ),
    );
}
