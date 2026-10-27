import type { Centre, User } from "@chukta/db";
import { normalizeIndianMobile, validateProfile } from "@chukta/shared";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, unauthenticated } from "../../lib/errors";
import { clientIp, readJson } from "../../lib/request";
import { OTP_RULES, requestOtp, verifyOtp } from "./otp";
import { clearPendingGoogle, googleRoutes, linkGoogle, readPendingGoogle } from "./google";
import { issueSignupTicket, register, SIGNUP_TICKET_TTL_SECONDS } from "./signup";
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
const registerBody = z.record(z.string(), z.unknown());

function parsePhone(raw: string) {
  const phone = normalizeIndianMobile(raw);
  if (!phone) throw new ApiError(400, "invalid_phone", "Enter a 10-digit Indian mobile number.");
  return phone;
}

/** The signed-in owner as the web app sees them; shared with GET /me. */
export const userDto = (user: User) => ({
  id: user.id,
  phone: user.phone,
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

  routes.post("/otp/request", async (c) => {
    const { phone } = await readJson(c, phoneBody);
    await requestOtp(deps, { phone: parsePhone(phone), ip: clientIp(c, deps.config.trustProxyHeaders) });
    return c.json(
      { expiresInSeconds: OTP_RULES.ttlMs / 1000, resendAfterSeconds: OTP_RULES.resendAfterMs / 1000 },
      202,
    );
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

  routes.post("/otp/verify", async (c) => {
    const body = await readJson(c, verifyBody);
    const verified = await verifyOtp(deps, { phone: parsePhone(body.phone), code: body.code });
    // A Google sign-in waiting for this mobile number to be verified.
    const google = readPendingGoogle(c, deps);
    if (verified.status === "signup_required") {
      return c.json({
        status: verified.status,
        signupTicket: await issueSignupTicket(deps, verified.phone),
        phone: verified.phone,
        expiresIn: SIGNUP_TICKET_TTL_SECONDS,
        ...(google && { google: { email: google.email, name: google.name } }),
      });
    }
    if (google) {
      // The code to this account's own number proves it is theirs: connect Google.
      await deps.db.transaction((tx) => linkGoogle(tx, verified.user.id, google, deps.now()));
      clearPendingGoogle(c, deps);
      return c.json({ ...(await signIn(c, verified.user, verified.centre, false)), linkedGoogle: true });
    }
    return c.json(await signIn(c, verified.user, verified.centre, false));
  });

  routes.post("/register", async (c) => {
    const body = await readJson(c, registerBody);
    const checked = validateProfile(body);
    if (!checked.ok) throw invalidFields(checked.fields);
    const google = readPendingGoogle(c, deps);
    const { user, centre } = await register(deps, {
      ticket: typeof body.signupTicket === "string" ? body.signupTicket : "",
      profile: checked.value,
      ip: clientIp(c, deps.config.trustProxyHeaders),
      userAgent: c.req.header("user-agent"),
      google,
    });
    if (google) clearPendingGoogle(c, deps);
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
