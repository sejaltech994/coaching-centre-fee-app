import { feePlans, withCentre, type FeePlan, type Tx } from "@chukta/db";
import { validateFeePlan } from "@chukta/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, invalidRequest } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";

/** Fee plans (TSD: GET / POST /fee-plans): what a batch's students are billed, and when. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new ApiError(404, "not_found", "No such fee plan.");

export const feePlanDto = (row: FeePlan) => ({
  id: row.id,
  name: row.name,
  amountPaise: row.amountPaise,
  cycle: row.cycle,
  dueDay: row.dueDay,
  lateFeePaise: row.lateFeePaise,
  lateFeeAfterDays: row.lateFeeAfterDays,
  isActive: row.isActive,
});

/**
 * The centre's active plan with this id, or null. For checking a feePlanId a
 * batch is given: anything else (another centre's, archived, not an id) is null.
 */
export async function findActivePlan(tx: Tx, centreId: string, id: string): Promise<FeePlan | null> {
  if (!UUID.test(id)) return null;
  const [row] = await tx
    .select()
    .from(feePlans)
    .where(and(eq(feePlans.id, id), eq(feePlans.centreId, centreId), eq(feePlans.isActive, true)));
  return row ?? null;
}

const listQuery = z.object({ status: z.enum(["active", "all"]).default("active") });
const patchBody = z
  .object({
    name: z.unknown(),
    amountPaise: z.unknown(),
    cycle: z.unknown(),
    dueDay: z.unknown(),
    lateFeePaise: z.unknown(),
    lateFeeAfterDays: z.unknown(),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export function feePlanRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));
  const byId = (centreId: string, id: string) => and(eq(feePlans.id, id), eq(feePlans.centreId, centreId));

  routes.get("/", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("The query is not valid.");
    const { centreId } = c.var.auth;
    // A centre has a handful of plans: no paging.
    const rows = await withCentre(deps.db, centreId, (tx) =>
      tx
        .select()
        .from(feePlans)
        .where(and(eq(feePlans.centreId, centreId), parsed.data.status === "active" ? eq(feePlans.isActive, true) : undefined))
        .orderBy(asc(sql`lower(${feePlans.name})`), asc(feePlans.id)),
    );
    return c.json({ feePlans: rows.map(feePlanDto) });
  });

  routes.post("/", async (c) => {
    const checked = validateFeePlan(await readJson(c, z.unknown()));
    if (!checked.ok) throw invalidFields(checked.fields);
    const { centreId } = c.var.auth;
    const [row] = await withCentre(deps.db, centreId, (tx) =>
      tx
        .insert(feePlans)
        .values({ ...checked.value, centreId, createdAt: deps.now() })
        .returning(),
    );
    return c.json({ feePlan: feePlanDto(row!) }, 201);
  });

  routes.get("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const [row] = await withCentre(deps.db, centreId, (tx) => tx.select().from(feePlans).where(byId(centreId, id)));
    if (!row) throw notFound();
    return c.json({ feePlan: feePlanDto(row) });
  });

  // Read, check and write in one transaction, with the row locked against a simultaneous save.
  // TSD: a changed plan applies from each student's next billing cycle.
  routes.patch("/:id", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const { isActive, ...changes } = await readJson(c, patchBody);

    const row = await withCentre(deps.db, centreId, async (tx) => {
      const [current] = await tx.select().from(feePlans).where(byId(centreId, id)).for("update");
      if (!current) throw notFound();
      // Check the plan as it will be after the change, not just the changed fields.
      const checked = validateFeePlan({ ...feePlanDto(current), ...changes });
      if (!checked.ok) throw invalidFields(checked.fields);
      const [updated] = await tx
        .update(feePlans)
        .set({ ...checked.value, ...(isActive !== undefined && { isActive }) })
        .where(byId(centreId, id))
        .returning();
      return updated!;
    });
    return c.json({ feePlan: feePlanDto(row) });
  });

  return routes;
}
