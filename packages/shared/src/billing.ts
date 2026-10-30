import type { FeeCycle } from "./fee-plan";

/**
 * Billing rules (TSD: generate-invoices). Dates are calendar dates
 * as YYYY-MM-DD in the centre's timezone; the caller works out "today" there.
 */

/** How far ahead the next bill is made: a cycle starting within this many days. */
export const BILL_AHEAD_DAYS = 7;

export type BillingTerms = { cycle: FeeCycle; dueDay: number | null };
export type BillingPeriod = { start: string; end: string; dueDate: string };
/** Unpaid bills go overdue the day after their due date; the late fee follows after the plan's grace days. */
export type InvoiceStatus = "pending" | "overdue" | "paid" | "waived";

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const later = (a: string, b: string) => (a > b ? a : b);

export function addDays(date: string, days: number): string {
  const d = asUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** The first day of the month `months` after the one `date` is in. */
function monthStart(date: string, months = 0): string {
  const d = asUtc(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

/** Calendar months and quarters (Jan, Apr, Jul, Oct). */
function periodContaining(cycle: "monthly" | "quarterly", date: string): { start: string; end: string } {
  const months = cycle === "monthly" ? 1 : 3;
  const first = asUtc(monthStart(date));
  const start = iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - (first.getUTCMonth() % months), 1)));
  return { start, end: addDays(monthStart(start, months), -1) };
}

const withDay = (monthFirst: string, day: number) => `${monthFirst.slice(0, 8)}${String(day).padStart(2, "0")}`;

/**
 * The periods an enrolment should have bills for today: from the one that
 * contains today (or the start, if later) up to any that start within
 * BILL_AHEAD_DAYS. Never earlier months, never after the enrolment ends. Someone
 * who joins after the due day is due on the day they join.
 */
export function periodsToBill(
  terms: BillingTerms,
  enrolment: { startDate: string; endDate: string | null },
  today: string,
  aheadDays = BILL_AHEAD_DAYS,
): BillingPeriod[] {
  const horizon = addDays(today, aheadDays);
  const { startDate, endDate } = enrolment;
  if (startDate > horizon) return [];
  if (terms.cycle === "one_time") {
    return endDate && endDate < startDate ? [] : [{ start: startDate, end: startDate, dueDate: startDate }];
  }

  const periods: BillingPeriod[] = [];
  let period = periodContaining(terms.cycle, later(startDate, today));
  while (period.start <= horizon && (!endDate || period.start <= endDate)) {
    periods.push({ ...period, dueDate: later(withDay(period.start, terms.dueDay ?? 1), startDate) });
    period = periodContaining(terms.cycle, addDays(period.end, 1));
  }
  return periods;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 2026", "Oct–Dec 2026" or "One-time". */
export function periodLabel(cycle: FeeCycle, start: string): string {
  if (cycle === "one_time") return "One-time";
  const month = Number(start.slice(5, 7)) - 1;
  const year = start.slice(0, 4);
  return cycle === "monthly" ? `${MONTHS[month]} ${year}` : `${MONTHS[month]}–${MONTHS[month + 2]} ${year}`;
}
