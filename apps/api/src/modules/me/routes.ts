import { centres, users } from "@chukta/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { unauthenticated } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { centreDto, userDto } from "../auth/routes";

/** GET /me: the signed-in owner and their centre, for the app shell and profile screens. */
export function meRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    const { userId, centreId } = c.var.auth;
    const [row] = await deps.db
      .select({ user: users, centre: centres })
      .from(users)
      .innerJoin(centres, eq(centres.id, users.centreId))
      .where(eq(users.id, userId));
    if (!row || row.centre.id !== centreId) throw unauthenticated();
    return c.json({ user: userDto(row.user), centre: centreDto(row.centre) });
  });

  return routes;
}
