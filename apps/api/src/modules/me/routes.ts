import { authIdentities, centres, users } from "@chukta/db";
import { INVALID_PHONE_MESSAGE, normalizeIndianMobile, validateOwner } from "@chukta/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, unauthenticated } from "../../lib/errors";
import { clientIp, readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { centreDto, userDto } from "../auth/routes";
import { confirmCode, OTP_RULES, sendCode } from "./phone";
import { listSessions, revokeOtherSessions, revokeSession } from "./sessions";

const anyJson = z.record(z.string(), z.unknown());
const phoneBody = z.object({ phone: z.unknown() });
const confirmBody = z.object({ phone: z.unknown(), code: z.string().regex(/^\d{6}$/) });

function parsePhone(raw: unknown) {
  const phone = typeof raw === "string" ? normalizeIndianMobile(raw) : null;
  if (!phone) throw invalidFields({ phone: INVALID_PHONE_MESSAGE });
  return phone;
}

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

  /** Texts a code to confirm `phone`: the owner's number, or one they're switching to. */
  routes.post("/phone/verify", async (c) => {
    const { phone } = await readJson(c, phoneBody);
    await sendCode(deps, {
      userId: c.var.auth.userId,
      phone: parsePhone(phone),
      ip: clientIp(c, deps.config.trustProxyHeaders),
    });
    return c.json(
      { expiresInSeconds: OTP_RULES.ttlMs / 1000, resendAfterSeconds: OTP_RULES.resendAfterMs / 1000 },
      202,
    );
  });

  routes.post("/phone/confirm", async (c) => {
    const { phone, code } = await readJson(c, confirmBody);
    const user = await confirmCode(deps, { userId: c.var.auth.userId, phone: parsePhone(phone), code });
    return c.json({ user: userDto(user) });
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
