import { centres, withCentre } from "@chukta/db";
import type { Deps } from "./deps";
import { localDate } from "./lib/dates";
import { billEnrolments, markOverdue } from "./modules/invoices/billing";

/**
 * The scheduled work (TSD: background jobs), run every hour by a Cron Trigger on
 * the Workers and on a timer locally. Each job is idempotent, so a missed or
 * repeated run catches up. One centre's failure doesn't stop the others.
 */
export async function runScheduledJobs(deps: Deps): Promise<{ centres: number; failed: number }> {
  const now = deps.now();
  const all = await deps.db.select({ id: centres.id, timezone: centres.timezone }).from(centres);
  let failed = 0;
  for (const centre of all) {
    const today = localDate(centre.timezone, now);
    try {
      await withCentre(deps.db, centre.id, async (tx) => {
        await billEnrolments(tx, { centreId: centre.id, today, now });
        await markOverdue(tx, { today, now });
      });
    } catch (err) {
      failed += 1;
      console.error(`Scheduled jobs failed for centre ${centre.id}:`, err);
    }
  }
  return { centres: all.length, failed };
}
