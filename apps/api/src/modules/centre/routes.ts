import { centres } from "@chukta/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { unauthenticated } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";

export function centreRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    // centre_id comes from the verified token, never from the client.
    const centre = await deps.db.query.centres.findFirst({ where: eq(centres.id, c.var.auth.centreId) });
    if (!centre) throw unauthenticated();
    return c.json({ centre: { id: centre.id, name: centre.name, plan: centre.plan, timezone: centre.timezone } });
  });

  return routes;
}
