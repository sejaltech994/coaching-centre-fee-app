import { batches, centres, invoices, reminders, students, withCentre, type Invoice, type Student } from "@chukta/db";
import {
  addDays,
  formatRupees,
  MESSAGE_TEMPLATES,
  PLANS,
  messageFor,
  periodLabel,
  reminderKindOn,
  renderMessage,
  type MessageKey,
  type MessageValues,
  type Plan,
  type Tone,
} from "@chukta/shared";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Deps } from "../../deps";
import { localDate } from "../../lib/dates";
import { payLink } from "../invoices/routes";

/**
 * WhatsApp messages about bills (TSD: schedule-reminders, send-reminder): to
 * parents who agreed to WhatsApp, from Chukta's number, in the centre's tone.
 * Sending happens outside any transaction, so a slow send never holds a lock.
 */

export type ReminderKind = (typeof reminders.$inferInsert)["kind"];
export type Outcome = { status: "sent" | "skipped" | "failed"; error: string | null };

export const NOT_SET_UP = "WhatsApp isn’t set up yet.";
export const NO_CONSENT = "The parent hasn’t agreed to WhatsApp messages.";

type Centre = { id: string; name: string | null; timezone: string; reminderTone: Tone; plan: Plan };
export type Target = { invoice: Invoice; student: Student; batchName: string };

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function loadCentre(deps: Deps, centreId: string): Promise<Centre | null> {
  const [row] = await deps.db
    .select({ id: centres.id, name: centres.name, timezone: centres.timezone, reminderTone: centres.reminderTone, plan: centres.plan })
    .from(centres)
    .where(eq(centres.id, centreId));
  return row ?? null;
}

/** Bills with their student and batch, within the centre. */
export function loadTargets(deps: Deps, centreId: string, where: SQL): Promise<Target[]> {
  return withCentre(deps.db, centreId, (tx) =>
    tx
      .select({ invoice: invoices, student: students, batchName: batches.name })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .innerJoin(batches, eq(batches.id, invoices.batchId))
      .where(and(eq(invoices.centreId, centreId), where)),
  );
}

export function messageValues(deps: Deps, centre: Centre, { invoice, student }: Target): MessageValues {
  return {
    parent: student.parentName,
    centre: centre.name ?? "Your coaching centre",
    student: student.name,
    amount: formatRupees(invoice.amountPaise + invoice.lateFeePaise),
    period: periodLabel(invoice.cycle, invoice.periodStart),
    due: dayFormat.format(new Date(`${invoice.dueDate}T00:00:00Z`)),
    link: payLink(deps, invoice.publicToken),
  };
}

/** Why this bill can't be messaged, or null. */
export const blocker = (deps: Deps, target: Target) =>
  !deps.messaging ? NOT_SET_UP : !target.student.whatsappOptIn ? NO_CONSENT : null;

/** Sends one message and records it (sent, skipped or failed) with the template used. */
export async function deliver(
  deps: Deps,
  input: { centre: Centre; target: Target; kind: ReminderKind; key: MessageKey },
): Promise<Outcome> {
  const { centre, target, kind, key } = input;
  const template = MESSAGE_TEMPLATES[key][centre.reminderTone];
  const now = deps.now();
  const record = (outcome: Outcome & { providerMessageId?: string }) =>
    withCentre(deps.db, centre.id, (tx) =>
      tx
        .insert(reminders)
        .values({
          centreId: centre.id,
          invoiceId: target.invoice.id,
          kind,
          template: template.metaName,
          templateVersion: template.version,
          status: outcome.status,
          error: outcome.error,
          providerMessageId: outcome.providerMessageId ?? null,
          sentAt: outcome.status === "sent" ? now : null,
          createdAt: now,
        })
        // A scheduled reminder already recorded for this bill stays as it is.
        .onConflictDoNothing(),
    );

  const blocked = blocker(deps, target);
  if (blocked) {
    await record({ status: "skipped", error: blocked });
    return { status: "skipped", error: blocked };
  }
  const values = messageValues(deps, centre, target);
  try {
    const { messageId } = await deps.messaging!.sendTemplate({
      to: target.student.parentPhone,
      templateName: template.metaName,
      variables: template.variables.map((name) => values[name]),
    });
    await record({ status: "sent", error: null, providerMessageId: messageId });
    return { status: "sent", error: null };
  } catch (err) {
    const error = (err as Error).message.slice(0, 300);
    console.error(`WhatsApp ${kind} for bill ${target.invoice.id} failed:`, error);
    await record({ status: "failed", error });
    return { status: "failed", error };
  }
}

/** The text a reminder about this bill would have now, for the owner's preview. */
export function previewText(deps: Deps, centre: Centre, target: Target, today: string): string {
  return renderMessage(messageFor(target.invoice.dueDate, today), centre.reminderTone, messageValues(deps, centre, target));
}

const hourIn = (timezone: string, now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now));

/**
 * The hourly run: today's scheduled reminders for one centre (3 days before the
 * due date, on it, then 3 and 7 days after), only between 9:00 and 20:00 there.
 * The first run in that window sends them; the unique (bill, kind) keeps it once.
 */
export async function sendScheduledReminders(deps: Deps, centreId: string): Promise<void> {
  const centre = await loadCentre(deps, centreId);
  // Automatic reminders are Pro; Free centres send them by hand.
  if (!centre || !PLANS[centre.plan].automaticReminders) return;
  const now = deps.now();
  const hour = hourIn(centre.timezone, now);
  if (hour < 9 || hour >= 20) return;
  const today = localDate(centre.timezone, now);
  const days = [3, 0, -3, -7].map((offset) => addDays(today, offset));

  const due = await loadTargets(deps, centreId, and(inArray(invoices.status, ["pending", "overdue"]), inArray(invoices.dueDate, days))!);
  if (due.length === 0) return;
  const done = await withCentre(deps.db, centreId, (tx) =>
    tx
      .select({ invoiceId: reminders.invoiceId, kind: reminders.kind })
      .from(reminders)
      .where(inArray(reminders.invoiceId, due.map((t) => t.invoice.id))),
  );
  const sent = new Set(done.map((r) => `${r.invoiceId}:${r.kind}`));

  for (const target of due) {
    const kind = reminderKindOn(target.invoice.dueDate, today);
    if (!kind || sent.has(`${target.invoice.id}:${kind}`)) continue;
    await deliver(deps, { centre, target, kind, key: messageFor(target.invoice.dueDate, today) });
  }
}

/** After a bill is paid: thanks the parent, with the link to their receipt. Never fails the payment. */
export async function thankForPayment(deps: Deps, centreId: string, invoiceId: string): Promise<void> {
  try {
    const centre = await loadCentre(deps, centreId);
    const [target] = await loadTargets(deps, centreId, sql`${invoices.id} = ${invoiceId} and ${invoices.status} = 'paid'`);
    if (!centre || !target) return;
    await deliver(deps, { centre, target, kind: "payment_received", key: "payment_received" });
  } catch (err) {
    console.error(`Thank-you for bill ${invoiceId} failed:`, err);
  }
}
