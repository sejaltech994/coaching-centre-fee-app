import { authIdentities, users } from "@chukta/db";
import { fakeGoogleCode, GoogleSignInError, type GoogleProfile } from "@chukta/integrations";
import { and, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Deps } from "../../deps";
import { pkceChallenge, randomToken, seal, unseal } from "../../lib/crypto";
import { ApiError } from "../../lib/errors";
import { issueRefreshToken } from "./tokens";

/**
 * Google sign-in (TSD: Registration, login and profile). The API runs the OAuth
 * code flow with PKCE; the web app only follows redirects.
 *
 * Google is the only way to sign in.
 *
 * - A linked Google account signs straight in.
 * - Any other Google account is remembered for 15 minutes in a signed cookie
 *   while its owner fills in sign-up (POST /auth/register).
 */

const OAUTH_COOKIE = "chukta_oauth";
const OAUTH_PATH = "/api/v1/auth/google";
const OAUTH_TTL_SECONDS = 10 * 60;
const PENDING_COOKIE = "chukta_google";
const PENDING_PATH = "/api/v1/auth";
const PENDING_TTL_SECONDS = 15 * 60;

type OAuthState = { state: string; nonce: string; verifier: string };
export type PendingGoogle = Pick<GoogleProfile, "sub" | "email" | "name" | "picture">;

/** The Google account waiting for a mobile number, if any. */
export function readPendingGoogle(c: Context, deps: Deps): Promise<PendingGoogle | null> {
  return unseal<PendingGoogle>(deps.config.jwtSecret, "google-pending", getCookie(c, PENDING_COOKIE), deps.now());
}

export function clearPendingGoogle(c: Context, deps: Deps): void {
  deleteCookie(c, PENDING_COOKIE, { path: PENDING_PATH, secure: deps.config.cookieSecure, httpOnly: true, sameSite: "Lax" });
}

/** No Google sign-in is waiting: it never happened, or its 15 minutes ran out. */
export const googlePendingMissing = (status: 401 | 404) =>
  new ApiError(status, "google_pending_missing", "Your Google sign-in has expired. Continue with Google again.");

export function googleRoutes(deps: Deps, setRefreshCookie: (c: Context, token: string) => void) {
  const routes = new Hono<AppEnv>();
  const web = (path: string) => `${deps.config.webOrigins[0]}${path}`;
  const loginWithError = (c: Context, error: string) => c.redirect(web(`/login/?google_error=${error}`), 302);
  const callbackUrl = (c: Context) => new URL("/api/v1/auth/google/callback", c.req.url).toString();

  routes.get("/start", async (c) => {
    if (!deps.google) return loginWithError(c, "unavailable");
    const oauth: OAuthState = { state: randomToken(), nonce: randomToken(), verifier: randomToken() };
    setCookie(c, OAUTH_COOKIE, await seal(deps.config.jwtSecret, "google-oauth", oauth, inSeconds(deps, OAUTH_TTL_SECONDS)), {
      httpOnly: true,
      secure: deps.config.cookieSecure,
      // Lax: the cookie must come back on Google's top-level redirect to the callback.
      sameSite: "Lax",
      path: OAUTH_PATH,
      maxAge: OAUTH_TTL_SECONDS,
    });
    return c.redirect(
      deps.google.authorizationUrl({
        redirectUri: callbackUrl(c),
        state: oauth.state,
        nonce: oauth.nonce,
        codeChallenge: pkceChallenge(oauth.verifier),
      }),
      302,
    );
  });

  routes.get("/callback", async (c) => {
    const oauth = await unseal<OAuthState>(deps.config.jwtSecret, "google-oauth", getCookie(c, OAUTH_COOKIE), deps.now());
    deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_PATH, secure: deps.config.cookieSecure, httpOnly: true, sameSite: "Lax" });
    const { state, code, error } = c.req.query();
    if (!deps.google || !oauth || !state || state !== oauth.state) return loginWithError(c, "failed");
    if (error) return loginWithError(c, error === "access_denied" ? "cancelled" : "failed");
    if (!code) return loginWithError(c, "failed");

    let profile: GoogleProfile;
    try {
      profile = await deps.google.exchange({ code, codeVerifier: oauth.verifier, redirectUri: callbackUrl(c), nonce: oauth.nonce });
    } catch (err) {
      if (!(err instanceof GoogleSignInError)) console.error("Google sign-in failed", err);
      return loginWithError(c, err instanceof GoogleSignInError ? err.reason : "failed");
    }

    const now = deps.now();
    const signedIn = await deps.db.transaction(async (tx) => {
      const [identity] = await tx
        .update(authIdentities)
        .set({ lastUsedAt: now, email: profile.email, pictureUrl: profile.picture })
        .where(and(eq(authIdentities.provider, "google"), eq(authIdentities.subject, profile.sub)))
        .returning({ userId: authIdentities.userId });
      if (!identity) return null;
      await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, identity.userId));
      return identity.userId;
    });

    if (signedIn) {
      const refresh = await issueRefreshToken(deps, { userId: signedIn, userAgent: c.req.header("user-agent") });
      setRefreshCookie(c, refresh.token);
      return c.redirect(web("/dashboard/"), 302);
    }

    // An account from before Google sign-in has this email. A matching email
    // alone never connects Google to an account, so it can't be signed into.
    if (await deps.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${profile.email}` })) {
      return loginWithError(c, "email_in_use");
    }

    const pending: PendingGoogle = { sub: profile.sub, email: profile.email, name: profile.name, picture: profile.picture };
    setCookie(c, PENDING_COOKIE, await seal(deps.config.jwtSecret, "google-pending", pending, inSeconds(deps, PENDING_TTL_SECONDS)), {
      httpOnly: true,
      secure: deps.config.cookieSecure,
      sameSite: "Lax",
      path: PENDING_PATH,
      maxAge: PENDING_TTL_SECONDS,
    });
    return c.redirect(web("/signup/"), 302);
  });

  routes.get("/pending", async (c) => {
    const pending = await readPendingGoogle(c, deps);
    if (!pending) throw googlePendingMissing(404);
    return c.json({ email: pending.email, name: pending.name });
  });

  if (deps.config.google?.provider === "fake") addFakeChooser(routes, callbackUrl);
  return routes;
}

const inSeconds = (deps: Deps, seconds: number) => new Date(deps.now().getTime() + seconds * 1000);

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/**
 * A stand-in for Google's account chooser, for local development and automated
 * tests (GOOGLE_PROVIDER=fake, refused in production). Whoever uses it can sign in
 * as any email, which is the point.
 */
function addFakeChooser(routes: Hono<AppEnv>, callbackUrl: (c: Context) => string) {
  routes.get("/fake", (c) => {
    const { redirect_uri: redirectUri = "", state = "", nonce = "" } = c.req.query();
    const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
    const cancel = `${redirectUri}?${new URLSearchParams({ state, error: "access_denied" })}`;
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choose an account (fake Google)</title>
<style>body{font:16px system-ui,sans-serif;max-width:360px;margin:48px auto;padding:0 16px}label{display:block;margin:12px 0 4px}input{width:100%;padding:8px;box-sizing:border-box}button{margin-top:16px;padding:8px 16px}</style>
</head><body>
<p><strong>Fake Google</strong>: for development and tests only.</p>
<h1>Choose an account</h1>
<form method="get" action="/api/v1/auth/google/fake/approve">
${hidden("redirect_uri", redirectUri)}${hidden("state", state)}${hidden("nonce", nonce)}
<label for="email">Email</label><input id="email" name="email" type="email" required>
<label for="name">Name</label><input id="name" name="name">
<button type="submit">Continue</button>
</form>
<p><a href="${escape(cancel)}">Cancel</a></p>
</body></html>`);
  });

  routes.get("/fake/approve", (c) => {
    const { redirect_uri: redirectUri, state = "", nonce = "", email = "", name = "" } = c.req.query();
    // Only ever back to this API's own callback: never an open redirect.
    if (redirectUri !== callbackUrl(c)) throw new ApiError(400, "invalid_request", "Unknown redirect_uri.");
    return c.redirect(`${redirectUri}?${new URLSearchParams({ state, code: fakeGoogleCode({ email, name, nonce }) })}`, 302);
  });
}

