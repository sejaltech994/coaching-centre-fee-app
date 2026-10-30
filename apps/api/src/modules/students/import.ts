import { batches, enrolments, students, withCentre } from "@chukta/db";
import { PLANS, parseCsv, STUDENT_IMPORT_HEADINGS, studentLimitReached, validateStudent } from "@chukta/shared";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { centreToday } from "../../lib/dates";
import { ApiError, invalidFields } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { billEnrolments } from "../invoices/billing";
import { centrePlan, planRequired } from "../subscription/routes";

/**
 * TSD: POST /students/import — students from a spreadsheet's CSV. A dry run
 * checks every row and says what's wrong with each; the import adds every row
 * only when all of them are right, so a file is never half imported.
 */

const IMPORT_HEADINGS = STUDENT_IMPORT_HEADINGS;
const MAX_ROWS = 500;
const YES = ["yes", "y", "true", "1"];
const NO = ["no", "n", "false", "0", ""];

const body = z.object({ csv: z.string().max(1_000_000), dryRun: z.boolean().optional() });

type Row = {
  line: number;
  name: string;
  parentName: string;
  parentPhone: string;
  whatsappOptIn: boolean;
  batches: string[];
  errors: Record<string, string>;
};

const key = (name: string, phone: string) => `${name.trim().toLowerCase()}|${phone}`;

export async function importStudents(deps: Deps, c: Context<AppEnv>) {
  const { csv, dryRun } = await readJson(c, body);
  const [headings, ...lines] = parseCsv(csv);
  const normalise = (h: string) => h.trim().toLowerCase();
  if (!headings || IMPORT_HEADINGS.some((h, i) => normalise(headings[i] ?? "") !== normalise(h))) {
    throw invalidFields({ csv: `Start with the template’s headings: ${IMPORT_HEADINGS.join(", ")}.` });
  }
  if (lines.length === 0) throw invalidFields({ csv: "The file has no students in it." });
  if (lines.length > MAX_ROWS) throw invalidFields({ csv: `Import up to ${MAX_ROWS} students at a time.` });

  const { centreId } = c.var.auth;
  const plan = await centrePlan(deps, centreId);
  const today = await centreToday(deps, centreId);

  const result = await withCentre(deps.db, centreId, async (tx) => {
    const active = await tx
      .select({ id: batches.id, name: batches.name, feePlanId: batches.feePlanId })
      .from(batches)
      .where(and(eq(batches.centreId, centreId), eq(batches.isActive, true)));
    const byName = new Map(active.map((b) => [b.name.trim().toLowerCase(), b]));
    const current = await tx
      .select({ name: students.name, parentPhone: students.parentPhone })
      .from(students)
      .where(and(eq(students.centreId, centreId), eq(students.status, "active")));
    const known = new Set(current.map((s) => key(s.name, s.parentPhone)));

    const rows: Row[] = lines.map((cells, i) => {
      const [name = "", parentName = "", phone = "", consent = "", batchList = ""] = cells.map((cell) => cell.trim());
      const errors: Record<string, string> = {};
      const yes = YES.includes(consent.toLowerCase());
      if (!yes && !NO.includes(consent.toLowerCase())) errors.whatsappOptIn = "Write yes or no.";
      const checked = validateStudent({ name, parentName, parentPhone: phone, whatsappOptIn: yes });
      if (!checked.ok) Object.assign(errors, checked.fields);
      const wanted = batchList.split(";").map((b) => b.trim()).filter(Boolean);
      const missing = wanted.find((b) => !byName.has(b.toLowerCase()));
      if (missing) errors.batches = `No active batch called “${missing}”.`;
      const parentPhone = checked.ok ? checked.value.parentPhone : phone;
      if (checked.ok) {
        const k = key(checked.value.name, parentPhone);
        if (known.has(k)) errors.name = "Already a student here, with the same parent’s number.";
        // Twice in the same file counts too.
        known.add(k);
      }
      return { line: i + 2, name, parentName, parentPhone, whatsappOptIn: yes, batches: wanted, errors };
    });

    const invalid = rows.filter((row) => Object.keys(row.errors).length > 0).length;
    const summary = { rows, valid: rows.length - invalid, invalid, imported: 0 };
    if (dryRun) return summary;
    if (invalid > 0) {
      throw new ApiError(400, "import_has_errors", "Some rows need fixing; nothing was imported.", { extra: { rows } });
    }
    const max = PLANS[plan].maxStudents;
    if (studentLimitReached(plan, current.length + rows.length - 1)) {
      throw planRequired(`Free covers up to ${max} students; this would make ${current.length + rows.length}. Go Pro for more.`);
    }

    const now = deps.now();
    const joined: string[] = [];
    for (const row of rows) {
      const [student] = await tx
        .insert(students)
        .values({
          centreId,
          name: row.name,
          parentName: row.parentName,
          parentPhone: row.parentPhone,
          whatsappOptIn: row.whatsappOptIn,
          whatsappOptInAt: row.whatsappOptIn ? now : null,
          createdAt: now,
        })
        .returning({ id: students.id });
      for (const name of new Set(row.batches.map((b) => b.toLowerCase()))) {
        const batch = byName.get(name)!;
        const [enrolment] = await tx
          .insert(enrolments)
          .values({ centreId, studentId: student!.id, batchId: batch.id, feePlanId: batch.feePlanId, startDate: today, createdAt: now })
          .returning({ id: enrolments.id });
        joined.push(enrolment!.id);
      }
    }
    await billEnrolments(tx, { centreId, today, now, enrolmentIds: joined });
    return { ...summary, imported: rows.length };
  });

  return c.json(result, dryRun ? 200 : 201);
}
