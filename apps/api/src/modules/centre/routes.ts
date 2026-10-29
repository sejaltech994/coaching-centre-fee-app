import { centres } from "@chukta/db";
import { validateCentre } from "@chukta/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { invalidFields, unauthenticated } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { centreDto } from "../auth/routes";

const anyJson = z.record(z.string(), z.unknown());

export function centreRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    // centre_id comes from the verified token, never from the client.
    const centre = await deps.db.query.centres.findFirst({ where: eq(centres.id, c.var.auth.centreId) });
    if (!centre) throw unauthenticated();
    const { deletesAt } = centreDto(centre);
    return c.json({ centre: { id: centre.id, name: centre.name, plan: centre.plan, timezone: centre.timezone, deletesAt } });
  });

  /** The centre's name, city and type, edited in Settings. */
  routes.patch("/", async (c) => {
    const checked = validateCentre(await readJson(c, anyJson));
    if (!checked.ok) throw invalidFields(checked.fields);
    const { centreName, city, centreType } = checked.value;
    const [centre] = await deps.db
      .update(centres)
      .set({ name: centreName, city, centreType, updatedAt: deps.now() })
      .where(eq(centres.id, c.var.auth.centreId))
      .returning();
    if (!centre) throw unauthenticated();
    return c.json({ centre: centreDto(centre) });
  });

  return routes;
}
