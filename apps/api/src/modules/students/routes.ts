import { batches, enrolments, feePlans, students, withCentre, type FeePlan, type Student, type Tx } from "@chukta/db";
import { validateStudent } from "@chukta/shared";
import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { centreToday } from "../../lib/dates";
import { ApiError, invalidFields, invalidRequest, isUniqueViolation } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { feePlanDto } from "../fee-plans/routes";
import { billEnrolments, dropBillsAfter } from "../invoices/billing";
import { centrePlan, ensureStudentPlace } from "../subscription/routes";

/**
 * Students (TSD: students) and their enrolments in batches. Every query runs in
 * withCentre, so row-level security backs up the centre_id in each WHERE.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const studentNotFound = () => new ApiError(404, "not_found", "No such student.");
const notFound = (what: string) => new ApiError(404, "not_found", `No such ${what}.`);
const pickActiveBatches = () => invalidFields({ batchIds: "Pick from your active batches." });

const isCurrent = isNull(enrolments.endDate);

type BatchRef = {
  id: string;
  name: string;
  enrolmentId: string;
  since: string;
  feePlan: ReturnType<typeof feePlanDto> | null;
  discountPaise: number;
};

/** Each student's current batches, by name. */
async function currentBatches(tx: Tx, studentIds: string[]): Promise<Map<string, BatchRef[]>> {
  const byStudent = new Map<string, BatchRef[]>(studentIds.map((id) => [id, []]));
  if (studentIds.length === 0) return byStudent;
  const rows = await tx
    .select({
      studentId: enrolments.studentId,
      enrolmentId: enrolments.id,
      since: enrolments.startDate,
      discountPaise: enrolments.discountPaise,
      id: batches.id,
      name: batches.name,
      plan: feePlans,
    })
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .leftJoin(feePlans, eq(feePlans.id, enrolments.feePlanId))
    .where(and(inArray(enrolments.studentId, studentIds), isCurrent))
    .orderBy(asc(sql`lower(${batches.name})`));
  for (const { studentId, plan, ...batch } of rows) {
    byStudent.get(studentId)!.push({ ...batch, feePlan: plan && feePlanDto(plan) });
  }
  return byStudent;
}

const toDto = (row: Student, batchRefs: BatchRef[]) => ({
  id: row.id,
  name: row.name,
  parentName: row.parentName,
  parentPhone: row.parentPhone,
  whatsappOptIn: row.whatsappOptIn,
  status: row.status,
  batches: batchRefs,
});

async function withBatches(tx: Tx, row: Student) {
  return toDto(row, (await currentBatches(tx, [row.id])).get(row.id)!);
}

type EnrolmentRow = {
  id: string;
  startDate: string;
  endDate: string | null;
  discountPaise: number;
  batchId: string;
  batchName: string;
};

const enrolmentDto = (row: EnrolmentRow) => ({
  id: row.id,
  batch: { id: row.batchId, name: row.batchName },
  startDate: row.startDate,
  endDate: row.endDate,
  discountPaise: row.discountPaise,
});

const enrolmentColumns = {
  id: enrolments.id,
  startDate: enrolments.startDate,
  endDate: enrolments.endDate,
  discountPaise: enrolments.discountPaise,
  batchId: batches.id,
  batchName: batches.name,
};

const listQuery = z.object({
  status: z.enum(["active", "left", "all"]).default("active"),
  batchId: z.string().regex(UUID).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** Opaque keyset cursor: the sort key of the last student on the page. */
const cursorShape = z.object({ n: z.string(), i: z.string().regex(UUID) });
const encodeCursor = (row: Student) =>
  Buffer.from(JSON.stringify({ n: row.name.toLowerCase(), i: row.id })).toString("base64url");
function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    throw invalidRequest("The cursor is not valid.");
  }
}

/** `%`, `_` and `\` match literally in a search. */
const likeEscaped = (text: string) => `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

const createBody = z.object({ batchIds: z.array(z.string()).max(20).default([]) }).loose();
const patchBody = z
  .object({
    name: z.unknown(),
    parentName: z.unknown(),
    parentPhone: z.unknown(),
    whatsappOptIn: z.unknown(),
    status: z.enum(["active", "left"]),
  })
  .partial()
  .strict();

export function studentRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));
  const byId = (centreId: string, id: string) => and(eq(students.id, id), eq(students.centreId, centreId));

  routes.get("/", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("The query is not valid.");
    const { status, batchId, q, limit, cursor } = parsed.data;
    const after = cursor ? decodeCursor(cursor) : undefined;
    const { centreId } = c.var.auth;

    const { page, refs, more } = await withCentre(deps.db, centreId, async (tx) => {
      const rows = await tx
        .select()
        .from(students)
        .where(
          and(
            eq(students.centreId, centreId),
            status === "all" ? undefined : eq(students.status, status),
            q ? or(ilike(students.name, likeEscaped(q)), ilike(students.parentName, likeEscaped(q))) : undefined,
            batchId
              ? exists(
                  tx
                    .select({ one: sql`1` })
                    .from(enrolments)
                    .where(and(eq(enrolments.studentId, students.id), eq(enrolments.batchId, batchId), isCurrent)),
                )
              : undefined,
            after ? sql`(lower(${students.name}), ${students.id}) > (${after.n}, ${after.i}::uuid)` : undefined,
          ),
        )
        .orderBy(asc(sql`lower(${students.name})`), asc(students.id))
        .limit(limit + 1);
      const shown = rows.slice(0, limit);
      return { page: shown, refs: await currentBatches(tx, shown.map((s) => s.id)), more: rows.length > limit };
    });

    return c.json({
      students: page.map((row) => toDto(row, refs.get(row.id)!)),
      nextCursor: more ? encodeCursor(page.at(-1)!) : null,
    });
  });

  routes.post("/", async (c) => {
    const body = await readJson(c, createBody);
    const checked = validateStudent(body);
    if (!checked.ok) throw invalidFields(checked.fields);
    const batchIds = [...new Set(body.batchIds)];
    if (!batchIds.every((id) => UUID.test(id))) throw pickActiveBatches();
    const { centreId } = c.var.auth;
    const now = deps.now();
    const startDate = batchIds.length > 0 ? await centreToday(deps, centreId) : "";
    const plan = await centrePlan(deps, centreId);

    const student = await withCentre(deps.db, centreId, async (tx) => {
      await ensureStudentPlace(tx, centreId, plan);
      // Each batch's students are billed on its fee plan.
      let found: { id: string; feePlanId: string | null }[] = [];
      if (batchIds.length > 0) {
        found = await tx
          .select({ id: batches.id, feePlanId: batches.feePlanId })
          .from(batches)
          .where(and(eq(batches.centreId, centreId), eq(batches.isActive, true), inArray(batches.id, batchIds)));
        if (found.length !== batchIds.length) throw pickActiveBatches();
      }
      const [row] = await tx
        .insert(students)
        .values({ ...checked.value, centreId, whatsappOptInAt: checked.value.whatsappOptIn ? now : null, createdAt: now })
        .returning();
      if (batchIds.length > 0) {
        const joined = await tx
          .insert(enrolments)
          .values(
            found.map((batch) => ({ centreId, studentId: row!.id, batchId: batch.id, feePlanId: batch.feePlanId, startDate, createdAt: now })),
          )
          .returning({ id: enrolments.id });
        // The first bill is made as they join, not at the next scheduled run.
        await billEnrolments(tx, { centreId, today: startDate, now, enrolmentIds: joined.map((e) => e.id) });
      }
      return withBatches(tx, row!);
    });
    return c.json({ student }, 201);
  });

  routes.get("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw studentNotFound();

    const student = await withCentre(deps.db, centreId, async (tx) => {
      const [row] = await tx.select().from(students).where(byId(centreId, id));
      if (!row) throw studentNotFound();
      const history = await tx
        .select(enrolmentColumns)
        .from(enrolments)
        .innerJoin(batches, eq(batches.id, enrolments.batchId))
        .where(eq(enrolments.studentId, id))
        // Current batches first, then the most recently ended.
        .orderBy(sql`${enrolments.endDate} is not null`, desc(enrolments.endDate), asc(sql`lower(${batches.name})`));
      return { ...(await withBatches(tx, row)), enrolments: history.map(enrolmentDto) };
    });
    return c.json({ student });
  });

  // Read, check and write in one transaction, with the row locked against a simultaneous save.
  routes.patch("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw studentNotFound();
    const { status, ...changes } = await readJson(c, patchBody);
    const now = deps.now();
    const endDate = status === "left" ? await centreToday(deps, centreId) : "";
    const plan = await centrePlan(deps, centreId);

    const student = await withCentre(deps.db, centreId, async (tx) => {
      const [current] = await tx.select().from(students).where(byId(centreId, id)).for("update");
      if (!current) throw studentNotFound();
      // Check the student as they will be after the change, not just the changed fields.
      const checked = validateStudent({ ...current, ...changes });
      if (!checked.ok) throw invalidFields(checked.fields);
      const consentChanged = checked.value.whatsappOptIn !== current.whatsappOptIn;
      const leaving = status === "left" && current.status !== "left";
      // Coming back takes a place on the plan again.
      if (status === "active" && current.status === "left") await ensureStudentPlace(tx, centreId, plan);

      const [row] = await tx
        .update(students)
        .set({
          ...checked.value,
          ...(consentChanged && { whatsappOptInAt: checked.value.whatsappOptIn ? now : null }),
          ...(status && { status, leftAt: status === "left" ? (current.leftAt ?? now) : null }),
        })
        .where(byId(centreId, id))
        .returning();
      // A student who leaves leaves their batches too.
      if (leaving) {
        const ended = await tx
          .update(enrolments)
          .set({ endDate })
          .where(and(eq(enrolments.studentId, id), isCurrent))
          .returning({ id: enrolments.id });
        await dropBillsAfter(tx, { enrolmentIds: ended.map((e) => e.id), endDate });
      }
      return withBatches(tx, row!);
    });
    return c.json({ student });
  });

  return routes;
}

const enrolBody = z.object({ studentId: z.string(), batchId: z.string() });
const changeBody = z.object({ endDate: z.unknown(), discountPaise: z.unknown() }).partial().strict();

/** A discount comes off the plan's fee, so it needs a plan and can't exceed its fee. */
function checkDiscount(discountPaise: number, plan: FeePlan | null) {
  if (discountPaise === 0) return;
  if (!plan) throw invalidFields({ discountPaise: "Give the batch a fee plan before a discount." });
  if (discountPaise > plan.amountPaise) throw invalidFields({ discountPaise: "The discount can’t be more than the fee." });
}

/** A real calendar date as YYYY-MM-DD, or null. */
const asDate = (value: unknown) =>
  typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;

export function enrolmentRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  /** Puts a student in a batch from today (TSD: POST /enrolments). */
  routes.post("/", async (c) => {
    const { studentId, batchId } = await readJson(c, enrolBody);
    if (!UUID.test(studentId) || !UUID.test(batchId)) throw notFound("student or batch");
    const { centreId } = c.var.auth;
    const now = deps.now();
    const startDate = await centreToday(deps, centreId);

    const enrolment = await withCentre(deps.db, centreId, async (tx) => {
      const [student] = await tx
        .select({ status: students.status })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.centreId, centreId)));
      const [batch] = await tx
        .select({ id: batches.id, name: batches.name, feePlanId: batches.feePlanId })
        .from(batches)
        .where(and(eq(batches.id, batchId), eq(batches.centreId, centreId), eq(batches.isActive, true)));
      if (!student || !batch) throw notFound("student or batch");
      if (student.status === "left") {
        throw new ApiError(409, "student_left", "This student has left. Mark them as active to add them to a batch.");
      }
      const [row] = await tx
        .insert(enrolments)
        .values({ centreId, studentId, batchId, feePlanId: batch.feePlanId, startDate, createdAt: now })
        .returning();
      await billEnrolments(tx, { centreId, today: startDate, now, enrolmentIds: [row!.id] });
      return enrolmentDto({ ...row!, batchId: batch.id, batchName: batch.name });
    }).catch((err: unknown) => {
      if (isUniqueViolation(err)) throw new ApiError(409, "already_enrolled", "This student is already in that batch.");
      throw err;
    });
    return c.json({ enrolment }, 201);
  });

  /** Ends an enrolment (the student leaves the batch on endDate) or changes the student's discount. */
  routes.patch("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound("enrolment");
    const body = await readJson(c, changeBody);
    const endDate = body.endDate === undefined ? undefined : asDate(body.endDate);
    if (endDate === null) throw invalidFields({ endDate: "Enter a date." });
    const discount = body.discountPaise;
    if (discount !== undefined && !(Number.isInteger(discount) && (discount as number) >= 0)) {
      throw invalidFields({ discountPaise: "Enter a discount of ₹0 or more." });
    }

    const enrolment = await withCentre(deps.db, centreId, async (tx) => {
      const [current] = await tx
        .select({ ...enrolmentColumns, plan: feePlans })
        .from(enrolments)
        .innerJoin(batches, eq(batches.id, enrolments.batchId))
        .leftJoin(feePlans, eq(feePlans.id, enrolments.feePlanId))
        .where(and(eq(enrolments.id, id), eq(enrolments.centreId, centreId)));
      if (!current) throw notFound("enrolment");
      if (endDate && endDate < current.startDate) {
        throw invalidFields({ endDate: `The end date can't be before the start (${current.startDate}).` });
      }
      if (discount !== undefined) checkDiscount(discount as number, current.plan);
      const changes = { ...(endDate && { endDate }), ...(discount !== undefined && { discountPaise: discount as number }) };
      if (Object.keys(changes).length > 0) await tx.update(enrolments).set(changes).where(eq(enrolments.id, id));
      if (endDate) await dropBillsAfter(tx, { enrolmentIds: [id], endDate });
      return enrolmentDto({ ...current, ...changes });
    });
    return c.json({ enrolment });
  });

  return routes;
}
