import { centres, withCentre } from "@chukta/db";
import { isNull } from "drizzle-orm";
import type { Deps } from "./deps";
import { localDate } from "./lib/dates";
import { billEnrolments, markOverdue } from "./modules/invoices/billing";
import { razorpayCentres, reconcileRazorpay } from "./modules/payments/razorpay";
import { sendScheduledReminders } from "./modules/reminders/send";
import { eraseDeletedCentres } from "./modules/me/account";
import { endLapsedPro } from "./modules/subscription/routes";

/**
 * The scheduled work (TSD: background jobs), run every hour by a Cron Trigger on
 * the Workers and on a timer locally. Each job is idempotent, so a missed or
 * repeated run catches up. One centre's failure doesn't stop the others.
 */
export async function runScheduledJobs(deps: Deps): Promise<{ centres: number; failed: number }> {
  const now = deps.now();
  // First, so a centre whose Pro has lapsed gets Free's behaviour today.
  await endLapsedPro(deps);
  await eraseDeletedCentres(deps);
  // Deleted centres get no more bills or messages.
  const all = await deps.db.select({ id: centres.id, timezone: centres.timezone }).from(centres).where(isNull(centres.deletedAt));
  let failed = 0;
  for (const centre of all) {
    const today = localDate(centre.timezone, now);
    try {
      await withCentre(deps.db, centre.id, async (tx) => {
        await billEnrolments(tx, { centreId: centre.id, today, now });
        await markOverdue(tx, { today, now });
      });
      // After billing and overdue marks, so today's reminders see them.
      await sendScheduledReminders(deps, centre.id);
    } catch (err) {
      failed += 1;
      console.error(`Scheduled jobs failed for centre ${centre.id}:`, err);
    }
  }
  // Payments a missed webhook didn't report (TSD: reconcile-payments).
  for (const centreId of await razorpayCentres(deps)) {
    try {
      await reconcileRazorpay(deps, centreId);
    } catch (err) {
      failed += 1;
      console.error(`Razorpay reconcile failed for centre ${centreId}:`, err);
    }
  }
  return { centres: all.length, failed };
}
