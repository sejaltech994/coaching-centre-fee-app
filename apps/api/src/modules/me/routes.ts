import { authIdentities, centres, users } from "@chukta/db";
import { validateOwner } from "@chukta/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, unauthenticated } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { centreDto, userDto } from "../auth/routes";
import { listSessions, revokeOtherSessions, revokeSession } from "./sessions";

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

  // The mobile number is the owner's own, typed as they like and never confirmed;
  // left out of the request, it stays as it is.
  routes.patch("/", async (c) => {
    const body = await readJson(c, anyJson);
    const checked = validateOwner(body);
    if (!checked.ok) throw invalidFields(checked.fields);
    const { userId, centreId } = c.var.auth;
    const now = deps.now();
    const phone = "phone" in body ? { phone: checked.value.phone } : {};
    const user = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ name: checked.value.fullName, ...phone, updatedAt: now })
        .where(eq(users.id, userId))
        .returning();
      if (row && "phone" in phone) {
        await tx.update(centres).set({ ownerPhone: phone.phone, updatedAt: now }).where(eq(centres.id, centreId));
      }
      return row;
    });
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

  routes.get("/sessions", async (c) => {
    const { userId, sessionId } = c.var.auth;
    return c.json({ sessions: await listSessions(deps, userId, sessionId) });
  });

  routes.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid || !(await revokeSession(deps, c.var.auth.userId, id))) {
      throw new ApiError(404, "not_found", "That device isn't signed in.");
    }
    return c.body(null, 204);
  });

  routes.post("/sessions/sign-out-others", async (c) => {
    const { userId, sessionId } = c.var.auth;
    return c.json({ signedOut: await revokeOtherSessions(deps, userId, sessionId) });
  });

  return routes;
}
