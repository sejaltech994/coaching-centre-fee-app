import { centres } from "@chukta/db";
import { eq } from "drizzle-orm";
import type { Deps } from "../deps";

/** The calendar date (YYYY-MM-DD) at `now` in `timezone`. */
export const localDate = (timezone: string, now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

/**
 * Today's date (YYYY-MM-DD) in the centre's timezone. Read before withCentre:
 * the centre-scoped role has no access to the centres table.
 */
export async function centreToday(deps: Deps, centreId: string): Promise<string> {
  const [centre] = await deps.db.select({ timezone: centres.timezone }).from(centres).where(eq(centres.id, centreId));
  return localDate(centre?.timezone ?? "Asia/Kolkata", deps.now());
}
