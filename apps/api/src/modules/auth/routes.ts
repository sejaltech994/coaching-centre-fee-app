import { normalizeIndianMobile } from "@chukta/shared";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, unauthenticated } from "../../lib/errors";
import { clientIp, readJson } from "../../lib/request";
import { OTP_RULES, requestOtp, verifyOtp } from "./otp";
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

const phoneBody = z.object({ phone: z.string() });
const verifyBody = z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) });

function parsePhone(raw: string) {
  const phone = normalizeIndianMobile(raw);
  if (!phone) throw new ApiError(400, "invalid_phone", "Enter a 10-digit Indian mobile number.");
  return phone;
}

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

  routes.post("/otp/request", async (c) => {
    const { phone } = await readJson(c, phoneBody);
    await requestOtp(deps, { phone: parsePhone(phone), ip: clientIp(c, deps.config.trustProxyHeaders) });
    return c.json(
      { expiresInSeconds: OTP_RULES.ttlMs / 1000, resendAfterSeconds: OTP_RULES.resendAfterMs / 1000 },
      202,
    );
  });

  routes.post("/otp/verify", async (c) => {
    const body = await readJson(c, verifyBody);
    const { user, centre, isNewAccount } = await verifyOtp(deps, { phone: parsePhone(body.phone), code: body.code });
    const auth = { userId: user.id, centreId: centre.id, role: user.role };
    const refresh = await issueRefreshToken(deps, { userId: user.id, userAgent: c.req.header("user-agent") });
    setRefreshCookie(c, refresh.token);
    return c.json({
      accessToken: await signAccessToken(deps, auth),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      isNewAccount,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
      centre: { id: centre.id, name: centre.name, plan: centre.plan },
    });
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

  return routes;
}
