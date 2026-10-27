import { createTestDb } from "@chukta/db/testing";
import type { SmsProvider } from "@chukta/integrations";
import { vi } from "vitest";
import { createApp } from "../app";
import type { Config } from "../config";

export const testConfig: Config = {
  env: "test",
  port: 8787,
  databaseUrl: "unused-in-tests",
  jwtSecret: "test-secret-that-is-at-least-32-characters-long",
  smsProvider: "console",
  webOrigins: ["http://localhost:3000"],
  cookieSecure: true,
  trustProxyHeaders: true,
  otpLimits: { perPhonePerHour: 5, perIpPerHour: 10 },
};

/** The API wired to an in-memory Postgres, a recording SMS fake and a clock the test controls. */
export async function createTestApp(config: Partial<Config> = {}) {
  const db = await createTestDb();
  const sent: { to: string; code: string }[] = [];
  const sms = {
    sendOtp: vi.fn<SmsProvider["sendOtp"]>(async (to, code) => {
      sent.push({ to, code });
    }),
  };
  let now = new Date("2026-11-02T04:30:00.000Z");
  const clock = {
    now: () => now,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
  const app = createApp({ db, sms, now: clock.now, config: { ...testConfig, ...config } });

  function call(
    method: string,
    path: string,
    init: { body?: unknown; ip?: string; cookie?: string; token?: string } = {},
  ): Promise<JsonResponse> {
    const headers: Record<string, string> = { "x-forwarded-for": init.ip ?? "203.0.113.10" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.cookie) headers.cookie = init.cookie;
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    return app.request(`/api/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
    }) as Promise<JsonResponse>;
  }

  /** Requests and verifies an OTP; returns the raw verify response. */
  async function verify(phone = "9876543210", ip?: string): Promise<JsonResponse> {
    const requested = await call("POST", "/auth/otp/request", { body: { phone }, ip });
    if (requested.status !== 202) throw new Error(`OTP request failed: ${requested.status}`);
    return call("POST", "/auth/otp/verify", { body: { phone, code: sent.at(-1)!.code }, ip });
  }

  /**
   * A signed-in owner: verifies the number and, when it has no account yet,
   * registers it with PROFILE. Returns the session response and its refresh cookie.
   */
  async function login(phone = "9876543210", profile: Partial<typeof PROFILE> & { email?: string } = {}, ip?: string) {
    let res = await verify(phone, ip);
    let body = (await res.json()) as LoginBody | { status: "signup_required"; signupTicket: string };
    if (body.status === "signup_required") {
      res = await call("POST", "/auth/register", { body: { signupTicket: body.signupTicket, ...PROFILE, ...profile }, ip });
      body = (await res.json()) as LoginBody;
    }
    if (res.status >= 300) throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
    return { res, body: body as LoginBody, cookie: refreshCookie(res) };
  }

  return { app, db, sms, sent, clock, call, verify, login, lastCode: () => sent.at(-1)!.code };
}

/** Tests assert on response bodies field by field, so they read them untyped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonResponse = Omit<Response, "json"> & { json(): Promise<any> };

/** The profile `login()` signs new numbers up with. */
export const PROFILE = {
  fullName: "Asha Sharma",
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
  user: { id: string; phone: string; fullName: string | null; email: string | null; role: string };
  centre: { id: string; name: string | null; city: string | null; centreType: string | null; plan: string };
};

/** "chukta_rt=abc" from a response's Set-Cookie, ready to send back. */
export function refreshCookie(res: Pick<Response, "headers">): string {
  const header = res.headers.get("set-cookie") ?? "";
  const match = /chukta_rt=([^;]*)/.exec(header);
  return match ? `chukta_rt=${match[1]}` : "";
}
