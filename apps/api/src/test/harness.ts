import { createTestDb } from "@chukta/db/testing";
import type { GoogleSignIn } from "@chukta/integrations";
import { createApp } from "../app";
import type { Config } from "../config";
import { gatewayFromConfig } from "../gateway";
import { googleFromConfig } from "../google";
import { messagingFromConfig } from "../messaging";
import { runScheduledJobs } from "../jobs";

export const testConfig: Config = {
  env: "test",
  port: 8787,
  databaseUrl: "unused-in-tests",
  jwtSecret: "test-secret-that-is-at-least-32-characters-long",
  webOrigins: ["http://localhost:3000"],
  cookieSecure: true,
  trustProxyHeaders: true,
  // Owners sign in only with Google; tests use the fake account chooser.
  google: { provider: "fake" },
  razorpay: "fake",
  whatsapp: { provider: "fake" },
  proPlan: { keyId: "rzp_test_chukta", keySecret: "fake", webhookSecret: "fake-webhook-secret", planId: "plan_fake_pro" },
};

/** The API wired to an in-memory Postgres, the fake Google and a clock the test controls. */
export async function createTestApp(config: Partial<Config> = {}, options: { google?: GoogleSignIn } = {}) {
  const db = await createTestDb();
  let now = new Date("2026-11-02T04:30:00.000Z");
  const clock = {
    now: () => now,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
  const fullConfig = { ...testConfig, ...config };
  const google = options.google ?? googleFromConfig(fullConfig.google);
  const gateway = gatewayFromConfig(fullConfig, "http://localhost:8787/api/v1");
  const messaging = messagingFromConfig(fullConfig.whatsapp);
  const deps = { db, google, gateway, messaging, now: clock.now, config: fullConfig };
  const app = createApp(deps);
  /** Runs the hourly scheduled jobs now, at the test clock's time. */
  const runJobs = () => runScheduledJobs(deps);

  function call(
    method: string,
    path: string,
    init: { body?: unknown; ip?: string; cookie?: string; token?: string; userAgent?: string } = {},
  ): Promise<JsonResponse> {
    const headers: Record<string, string> = { "x-forwarded-for": init.ip ?? "203.0.113.10" };
    if (init.userAgent) headers["user-agent"] = init.userAgent;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.cookie) headers.cookie = init.cookie;
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    return app.request(`/api/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
    }) as Promise<JsonResponse>;
  }

  /** Sends the browser to Google; returns where it went and the OAuth cookie to bring back. */
  async function startGoogle() {
    const res = await call("GET", "/auth/google/start");
    return { res, to: location(res), cookie: sendable(cookieNamed(res, "chukta_oauth")) };
  }

  /** The whole trip through the fake account chooser: where the callback sent the browser, and its cookies. */
  async function googleLogin(account: { email: string; name?: string } = { email: OWNER_EMAIL }, userAgent?: string) {
    const { to, cookie } = await startGoogle();
    const approve = await call(
      "GET",
      `/auth/google/fake/approve?${new URLSearchParams({
        redirect_uri: to.searchParams.get("redirect_uri")!,
        state: to.searchParams.get("state")!,
        nonce: to.searchParams.get("nonce")!,
        email: account.email,
        name: account.name ?? PROFILE.fullName,
      })}`,
    );
    const back = location(approve);
    const callback = await call("GET", `${back.pathname.replace("/api/v1", "")}${back.search}`, { cookie, userAgent });
    return {
      callback,
      to: location(callback),
      pending: sendable(cookieNamed(callback, "chukta_google")),
      session: refreshCookie(callback),
    };
  }

  /**
   * A signed-in owner, by Google: a new account is registered with PROFILE.
   * Returns the session response, its body and its refresh cookie.
   */
  async function login(
    email = OWNER_EMAIL,
    profile: Partial<typeof PROFILE> = {},
    { ip, userAgent }: { ip?: string; userAgent?: string } = {},
  ) {
    const google = await googleLogin({ email, name: profile.fullName }, userAgent);
    if (google.session) {
      // A returning owner: the callback only sets the refresh cookie, as for the browser.
      const res = await call("POST", "/auth/refresh", { cookie: google.session, ip, userAgent });
      const { accessToken, expiresIn } = (await res.clone().json()) as { accessToken: string; expiresIn: number };
      const me = await (await call("GET", "/me", { token: accessToken })).json();
      const body: LoginBody = { status: "signed_in", accessToken, expiresIn, isNewAccount: false, ...me };
      return { res, body, cookie: refreshCookie(res) };
    }
    if (!google.pending) throw new Error(`Google sign-in went to ${google.to.href}`);
    const res = await call("POST", "/auth/register", { body: { ...PROFILE, ...profile }, cookie: google.pending, ip, userAgent });
    const body = await res.clone().json();
    if (res.status >= 300) throw new Error(`Sign-up failed: ${res.status} ${JSON.stringify(body)}`);
    return { res, body: body as LoginBody, cookie: refreshCookie(res) };
  }

  return { app, db, clock, gateway, messaging, call, startGoogle, googleLogin, login, runJobs };
}

/** Tests assert on response bodies field by field, so they read them untyped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonResponse = Omit<Response, "json"> & { json(): Promise<any> };

/** The Google account `login()` uses unless told otherwise. */
export const OWNER_EMAIL = "asha@example.com";

/** The profile `login()` signs new owners up with. */
export const PROFILE = {
  fullName: "Asha Sharma",
  phone: "98765 43210",
  centreName: "Sunrise Classes",
  city: "Pune",
  centreType: "coaching",
  acceptedTerms: true,
};

export type LoginBody = {
  status: "signed_in";
  accessToken: string;
  expiresIn: number;
  isNewAccount: boolean;
  user: { id: string; phone: string | null; fullName: string | null; email: string | null; role: string };
  centre: { id: string; name: string | null; city: string | null; centreType: string | null; plan: string };
};

/** "chukta_rt=abc" from a response's Set-Cookie, ready to send back. */
export function refreshCookie(res: Pick<Response, "headers">): string {
  const header = res.headers.get("set-cookie") ?? "";
  const match = /chukta_rt=([^;]*)/.exec(header);
  return match ? `chukta_rt=${match[1]}` : "";
}

/** A response's Set-Cookie line for `name`, if it set one. */
export const cookieNamed = (res: Pick<Response, "headers">, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

/** "name=value" from a Set-Cookie line, ready to send back; "" when absent. */
export const sendable = (setCookie: string | undefined) => setCookie?.split(";")[0] ?? "";

/** Where a redirect points, as a URL. */
export const location = (res: Pick<Response, "headers">) => new URL(res.headers.get("location")!, "http://localhost");
