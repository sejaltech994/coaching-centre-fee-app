import { batches, enrolments, feePlans, withCentre, type Batch, type FeePlan, type Tx } from "@chukta/db";
import { validateBatch } from "@chukta/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, invalidRequest, isUniqueViolation } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { feePlanDto, findActivePlan } from "../fee-plans/routes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new ApiError(404, "not_found", "No such batch.");
const nameTaken = (name: string) => {
  const message = `You already have a batch called “${name}”.`;
  return new ApiError(409, "batch_name_taken", message, { extra: { fields: { name: message } } });
};

const pickPlan = () => invalidFields({ feePlanId: "Pick one of your fee plans." });

/** The API's view of a batch, with the fee plan its students are billed on. */
function toDto(row: Batch, plan: FeePlan | null) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    days: row.days,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    isActive: row.isActive,
    feePlan: plan && feePlanDto(plan),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Batches with their fee plans (left join: a batch may have none). */
const withPlans = (tx: Tx) =>
  tx.select({ batch: batches, plan: feePlans }).from(batches).leftJoin(feePlans, eq(feePlans.id, batches.feePlanId));
const rowDto = ({ batch, plan }: { batch: Batch; plan: FeePlan | null }) => toDto(batch, plan);

/**
 * Resolves a feePlanId from a request: undefined leaves it alone, null clears it,
 * anything else must be one of the centre's active plans.
 */
async function resolvePlan(tx: Tx, centreId: string, feePlanId: unknown): Promise<FeePlan | null | undefined> {
  if (feePlanId === undefined || feePlanId === null) return feePlanId;
  const plan = typeof feePlanId === "string" ? await findActivePlan(tx, centreId, feePlanId) : null;
  if (!plan) throw pickPlan();
  return plan;
}

const listQuery = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** Opaque keyset cursor: the sort key of the last batch on the page. */
const cursorShape = z.object({ n: z.string(), i: z.string().regex(UUID) });
const encodeCursor = (row: Batch) =>
  Buffer.from(JSON.stringify({ n: row.name.toLowerCase(), i: row.id })).toString("base64url");
function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    throw invalidRequest("The cursor is not valid.");
  }
}

const createBody = z.object({ feePlanId: z.unknown() }).partial().loose();

const patchBody = z
  .object({
    feePlanId: z.unknown(),
    name: z.unknown(),
    subject: z.unknown(),
    days: z.unknown(),
    startTime: z.unknown(),
    endTime: z.unknown(),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export function batchRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  /** Runs `fn` scoped to the caller's centre (RLS), translating name clashes to 409. */
  /**
   * Runs `fn` in one transaction scoped to the caller's centre (RLS). A unique
   * violation becomes 409 for `name`, which may only be known inside `fn`.
   */
  const inCentre = <T>(centreId: string, fn: Parameters<typeof withCentre<T>>[2], name?: string | (() => string | undefined)) =>
    withCentre(deps.db, centreId, fn).catch((err: unknown) => {
      const clashing = typeof name === "function" ? name() : name;
      if (clashing !== undefined && isUniqueViolation(err)) throw nameTaken(clashing);
      throw err;
    });

  const byId = (centreId: string, id: string) => and(eq(batches.id, id), eq(batches.centreId, centreId));

  routes.get("/", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("The query is not valid.");
    const { status, limit, cursor } = parsed.data;
    const after = cursor ? decodeCursor(cursor) : undefined;
    const { centreId } = c.var.auth;

    const rows = await inCentre(centreId, (tx) =>
      withPlans(tx)
        .where(
          and(
            eq(batches.centreId, centreId),
            status === "all" ? undefined : eq(batches.isActive, status === "active"),
            after ? sql`(lower(${batches.name}), ${batches.id}) > (${after.n}, ${after.i}::uuid)` : undefined,
          ),
        )
        .orderBy(asc(sql`lower(${batches.name})`), asc(batches.id))
        .limit(limit + 1),
    );

    const page = rows.slice(0, limit);
    return c.json({
      batches: page.map(rowDto),
      nextCursor: rows.length > limit ? encodeCursor(page.at(-1)!.batch) : null,
    });
  });

  routes.post("/", async (c) => {
    const body = await readJson(c, createBody);
    const checked = validateBatch(body);
    if (!checked.ok) throw invalidFields(checked.fields);
    const { centreId } = c.var.auth;

    const batch = await inCentre(
      centreId,
      async (tx) => {
        const plan = (await resolvePlan(tx, centreId, body.feePlanId)) ?? null;
        const [row] = await tx
          .insert(batches)
          .values({ ...checked.value, centreId, feePlanId: plan?.id ?? null, createdAt: deps.now() })
          .returning();
        return toDto(row!, plan);
      },
      checked.value.name,
    );
    return c.json({ batch }, 201);
  });

  /** Loads one of the caller's batches by id, or 404. */
  const findBatch = async (centreId: string, id: string) => {
    if (!UUID.test(id)) throw notFound();
    const [row] = await inCentre(centreId, (tx) => withPlans(tx).where(byId(centreId, id)));
    if (!row) throw notFound();
    return row;
  };

  routes.get("/:id", async (c) => {
    return c.json({ batch: rowDto(await findBatch(c.var.auth.centreId, c.req.param("id"))) });
  });

  // Read, check and write in ONE transaction: fewer database round trips, and the
  // row lock (FOR UPDATE) stops two simultaneous saves from overwriting each other.
  routes.patch("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const { isActive, feePlanId, ...scheduleChanges } = await readJson(c, patchBody);
    let newName: string | undefined;

    const row = await inCentre(
      centreId,
      async (tx) => {
        const [current] = await tx.select().from(batches).where(byId(centreId, id)).for("update");
        if (!current) throw notFound();
        // Validate the batch as it will be after the change, not just the changed fields.
        const checked = validateBatch({ ...toDto(current, null), ...scheduleChanges });
        if (!checked.ok) throw invalidFields(checked.fields);
        newName = checked.value.name;
        const plan = await resolvePlan(tx, centreId, feePlanId);
        await tx
          .update(batches)
          .set({
            ...checked.value,
            ...(isActive !== undefined && { isActive }),
            ...(plan !== undefined && { feePlanId: plan?.id ?? null }),
          })
          .where(byId(centreId, id));
        // The batch's current students move to its new plan; TSD: from their next billing cycle.
        if (plan !== undefined) {
          await tx
            .update(enrolments)
            .set({ feePlanId: plan?.id ?? null })
            .where(and(eq(enrolments.batchId, id), isNull(enrolments.endDate)));
        }
        const [shown] = await withPlans(tx).where(byId(centreId, id));
        return rowDto(shown!);
      },
      () => newName,
    );
    return c.json({ batch: row });
  });

  // TSD: DELETE archives. History (enrolments, invoices) keeps pointing at the batch.
  routes.delete("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const row = await inCentre(centreId, async (tx) => {
      const archived = await tx.update(batches).set({ isActive: false }).where(byId(centreId, id)).returning();
      if (archived.length === 0) return null;
      const [shown] = await withPlans(tx).where(byId(centreId, id));
      return rowDto(shown!);
    });
    if (!row) throw notFound();
    return c.json({ batch: row });
  });

  return routes;
}
