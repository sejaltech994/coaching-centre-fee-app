import { attendance, batches, centres, enrolments, students, withCentre } from "@chukta/db";
import { ABSENCE_TEMPLATE, type AbsenceValues } from "@chukta/shared";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { centreToday } from "../../lib/dates";
import { ApiError, invalidFields, invalidRequest } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { NO_CONSENT, NOT_SET_UP } from "../reminders/send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const notFound = () => new ApiError(404, "not_found", "No such batch.");
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const dayQuery = z.object({ batchId: z.string().regex(UUID), date: z.string().regex(DATE) });
const saveBody = z.object({
  batchId: z.string().regex(UUID),
  date: z.string().regex(DATE),
  marks: z.array(z.object({ studentId: z.string().regex(UUID), present: z.boolean() })).min(1).max(500),
});

/** TSD: GET / PUT /attendance?batch_id=&date= — a day's attendance for one batch, and absence alerts. */
export function attendanceRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  /** The batch's students that day (joined by then, not yet left), with any marks. */
  async function day(centreId: string, batchId: string, date: string) {
    return withCentre(deps.db, centreId, async (tx) => {
      const [batch] = await tx
        .select({ id: batches.id, name: batches.name })
        .from(batches)
        .where(and(eq(batches.id, batchId), eq(batches.centreId, centreId)));
      if (!batch) throw notFound();
      const rows = await tx
        .select({ id: students.id, name: students.name, present: attendance.present })
        .from(enrolments)
        .innerJoin(students, eq(students.id, enrolments.studentId))
        .leftJoin(
          attendance,
          and(eq(attendance.batchId, batchId), eq(attendance.studentId, students.id), eq(attendance.date, date)),
        )
        .where(
          and(
            eq(enrolments.batchId, batchId),
            lte(enrolments.startDate, date),
            or(isNull(enrolments.endDate), sql`${enrolments.endDate} >= ${date}`),
          ),
        )
        .orderBy(asc(sql`lower(${students.name})`));
      return { batch, date, students: rows.map((r) => ({ id: r.id, name: r.name, present: r.present })) };
    });
  }

  routes.get("/", async (c) => {
    const parsed = dayQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("Give the batch and the day (YYYY-MM-DD).");
    return c.json(await day(c.var.auth.centreId, parsed.data.batchId, parsed.data.date));
  });

  routes.put("/", async (c) => {
    const { batchId, date, marks } = await readJson(c, saveBody);
    const { centreId } = c.var.auth;
    if (date > (await centreToday(deps, centreId))) {
      throw invalidFields({ date: "Attendance can’t be taken for a day that hasn’t come." });
    }
    const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
    const now = deps.now();
    const before = await day(centreId, batchId, date);
    const inBatch = new Set(before.students.map((s) => s.id));
    if (!marks.every((m) => inBatch.has(m.studentId))) throw invalidFields({ marks: "Mark only students in this batch that day." });

    const absentees = await withCentre(deps.db, centreId, async (tx) => {
      for (const mark of marks) {
        await tx
          .insert(attendance)
          .values({ centreId, batchId, studentId: mark.studentId, date, present: mark.present, createdAt: now })
          .onConflictDoUpdate({
            target: [attendance.batchId, attendance.studentId, attendance.date],
            set: { present: mark.present, updatedAt: now },
          });
      }
      const absentIds = marks.filter((m) => !m.present).map((m) => m.studentId);
      if (!centre?.absenceAlerts || absentIds.length === 0) return [];
      // Each absence is told once: only marks without an alert yet.
      return tx
        .select({ markId: attendance.id, student: students })
        .from(attendance)
        .innerJoin(students, eq(students.id, attendance.studentId))
        .where(
          and(
            eq(attendance.batchId, batchId),
            eq(attendance.date, date),
            inArray(attendance.studentId, absentIds),
            isNull(attendance.alertedAt),
          ),
        );
    });

    // Sent outside the transaction, so a slow send never holds the marks' locks.
    let sent = 0;
    for (const { markId, student } of absentees) {
      const values: AbsenceValues = {
        parent: student.parentName,
        student: student.name,
        batch: before.batch.name,
        centre: centre?.name ?? "Your coaching centre",
        date: dayFormat.format(new Date(`${date}T00:00:00Z`)),
      };
      let error: string | null = !deps.messaging ? NOT_SET_UP : !student.whatsappOptIn ? NO_CONSENT : null;
      if (!error) {
        try {
          await deps.messaging!.sendTemplate({
            to: student.parentPhone,
            templateName: ABSENCE_TEMPLATE.metaName,
            variables: ABSENCE_TEMPLATE.variables.map((name) => values[name]),
          });
          sent += 1;
        } catch (err) {
          error = (err as Error).message.slice(0, 300);
        }
      }
      await withCentre(deps.db, centreId, (tx) =>
        tx.update(attendance).set({ alertedAt: now, alertError: error, updatedAt: now }).where(eq(attendance.id, markId)),
      );
    }

    return c.json({ ...(await day(centreId, batchId, date)), absenceAlerts: { sent, skipped: absentees.length - sent } });
  });

  return routes;
}

const switchBody = z.object({ on: z.boolean() });

/** GET and PUT /centre/absence-alerts: whether parents are messaged about absences. */
export function absenceAlertRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));
  routes.get("/", async (c) => {
    const [centre] = await deps.db.select({ on: centres.absenceAlerts }).from(centres).where(eq(centres.id, c.var.auth.centreId));
    return c.json({ on: centre?.on ?? false });
  });
  routes.put("/", async (c) => {
    const { on } = await readJson(c, switchBody);
    await deps.db.update(centres).set({ absenceAlerts: on, updatedAt: deps.now() }).where(eq(centres.id, c.var.auth.centreId));
    return c.json({ on });
  });
  return routes;
}
