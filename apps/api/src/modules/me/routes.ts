import { authIdentities, centres, users } from "@chukta/db";
import { validateOwner } from "@chukta/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { invalidFields, unauthenticated } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { centreDto, userDto } from "../auth/routes";

const anyJson = z.record(z.string(), z.unknown());

/** The signed-in owner: who they are, their centre, and how they sign in (Settings). */
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

  routes.patch("/", async (c) => {
    const checked = validateOwner(await readJson(c, anyJson));
    if (!checked.ok) throw invalidFields(checked.fields);
    const [user] = await deps.db
      .update(users)
      .set({ name: checked.value.fullName, updatedAt: deps.now() })
      .where(eq(users.id, c.var.auth.userId))
      .returning();
    if (!user) throw unauthenticated();
    return c.json({ user: userDto(user) });
  });

  routes.get("/identities", async (c) => {
    const rows = await deps.db
      .select({ provider: authIdentities.provider, email: authIdentities.email, lastUsedAt: authIdentities.lastUsedAt })
      .from(authIdentities)
      .where(eq(authIdentities.userId, c.var.auth.userId))
      .orderBy(asc(authIdentities.createdAt));
    return c.json({ identities: rows });
  });

  return routes;
}
