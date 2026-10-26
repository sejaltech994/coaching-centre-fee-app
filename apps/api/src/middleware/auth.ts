import { createMiddleware } from "hono/factory";
import type { AppEnv, Deps } from "../deps";
import { unauthenticated } from "../lib/errors";
import { verifyAccessToken } from "../modules/auth/tokens";

/** Requires `Authorization: Bearer <access token>` and exposes the caller as c.var.auth. */
export function requireAuth(deps: Deps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const auth = token ? await verifyAccessToken(deps, token) : null;
    if (!auth) throw unauthenticated();
    c.set("auth", auth);
    await next();
  });
}
