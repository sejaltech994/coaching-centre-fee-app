import type { Centre, User } from "@chukta/db";
import { validateProfile } from "@chukta/shared";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { invalidFields, unauthenticated } from "../../lib/errors";
import { clientIp, readJson } from "../../lib/request";
import { clearPendingGoogle, googlePendingMissing, googleRoutes, readPendingGoogle } from "./google";
import { register } from "./signup";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "./tokens";

const REFRESH_COOKIE = "chukta_rt";
const COOKIE_PATH = "/api/v1/auth";

const registerBody = z.record(z.string(), z.unknown());

/** The signed-in owner as the web app sees them; shared with GET /me. */
export const userDto = (user: User) => ({
  id: user.id,
  phone: user.phone,
  phoneVerified: user.phoneVerifiedAt !== null,
  fullName: user.name,
  email: user.email,
  role: user.role,
});

export const centreDto = (centre: Centre) => ({
  id: centre.id,
  name: centre.name,
  city: centre.city,
  centreType: centre.centreType,
  plan: centre.plan,
  timezone: centre.timezone,
});

export function authRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();

  const setRefreshCookie = (c: Context, token: string) =>
    setCookie(c, REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: deps.config.cookieSecure,
      sameSite: "Strict",
      path: COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });

  /** Starts a session: refresh cookie plus the access token and who signed in. */
  async function signIn(c: Context, user: User, centre: Centre, isNewAccount: boolean) {
    const refresh = await issueRefreshToken(deps, { userId: user.id, userAgent: c.req.header("user-agent") });
    setRefreshCookie(c, refresh.token);
    return {
      status: "signed_in" as const,
      accessToken: await signAccessToken(deps, { userId: user.id, centreId: centre.id, role: user.role }),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      isNewAccount,
      user: userDto(user),
      centre: centreDto(centre),
    };
  }

  /** Signs up the Google account that just signed in (see google.ts). */
  routes.post("/register", async (c) => {
    const body = await readJson(c, registerBody);
    const checked = validateProfile(body);
    if (!checked.ok) throw invalidFields(checked.fields);
    const google = await readPendingGoogle(c, deps);
    if (!google) throw googlePendingMissing(401);
    const { user, centre } = await register(deps, {
      google,
      profile: checked.value,
      ip: clientIp(c, deps.config.trustProxyHeaders),
      userAgent: c.req.header("user-agent"),
    });
    clearPendingGoogle(c, deps);
    return c.json(await signIn(c, user, centre, true), 201);
  });

  routes.post("/refresh", async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    if (!token) throw unauthenticated();
    const rotated = await rotateRefreshToken(deps, token, c.req.header("user-agent"));
    setRefreshCookie(c, rotated.token);
    return c.json({ accessToken: await signAccessToken(deps, rotated.auth), expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  });

  routes.post("/logout", async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    if (token) await revokeRefreshToken(deps, token);
    deleteCookie(c, REFRESH_COOKIE, { path: COOKIE_PATH, secure: deps.config.cookieSecure, httpOnly: true, sameSite: "Strict" });
    return c.body(null, 204);
  });

  routes.route("/google", googleRoutes(deps, setRefreshCookie));

  return routes;
}
