import { authIdentities, users } from "@chukta/db";
import { GoogleSignInError, type GoogleSignIn } from "@chukta/integrations";
import { describe, expect, it, vi } from "vitest";
import { keyedHash, pkceChallenge, unseal } from "../../lib/crypto";
import { createTestApp, PROFILE, refreshCookie, type JsonResponse } from "../../test/harness";

type App = Awaited<ReturnType<typeof createTestApp>>;

const WEB = "http://localhost:3000";
const cookieNamed = (res: JsonResponse, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const sendable = (setCookie: string | undefined) => setCookie?.split(";")[0] ?? "";
const location = (res: JsonResponse) => new URL(res.headers.get("location")!, "http://localhost");

async function start(app: App) {
  const res = await app.call("GET", "/auth/google/start");
  const to = location(res);
  return { res, to, cookie: sendable(cookieNamed(res, "chukta_oauth")) };
}

/** The whole trip through the fake chooser; returns the callback's response and cookies to send on. */
async function googleLogin(app: App, account = { email: "asha@example.com", name: "Asha Sharma" }) {
  const { to, cookie } = await start(app);
  const approve = await app.call(
    "GET",
    `/auth/google/fake/approve?${new URLSearchParams({
      redirect_uri: to.searchParams.get("redirect_uri")!,
      state: to.searchParams.get("state")!,
      nonce: to.searchParams.get("nonce")!,
      email: account.email,
      name: account.name,
    })}`,
  );
  const back = location(approve);
  const callback = await app.call("GET", `${back.pathname.replace("/api/v1", "")}${back.search}`, { cookie });
  return {
    callback,
    to: location(callback),
    pending: sendable(cookieNamed(callback, "chukta_google")),
    session: refreshCookie(callback),
  };
}

const fakeGoogle = { google: { provider: "fake" as const } };

describe("GET /auth/google/start", () => {
  it("sends the browser back with an explanation when Google sign-in isn't set up", async () => {
    const app = await createTestApp();
    const { res, to } = await start(app);

    expect(res.status).toBe(302);
    expect(to.href).toBe(`${WEB}/login/?google_error=unavailable`);
  });

  it("sends the browser to the account chooser with state, nonce and an S256 PKCE challenge", async () => {
    const app = await createTestApp(fakeGoogle);
    const { res, to } = await start(app);

    expect(res.status).toBe(302);
    expect(to.pathname).toBe("/api/v1/auth/google/fake");
    expect(to.searchParams.get("redirect_uri")).toBe("http://localhost/api/v1/auth/google/callback");
    expect(to.searchParams.get("state")).toMatch(/^[\w-]{43}$/);
    expect(to.searchParams.get("nonce")).toMatch(/^[\w-]{43}$/);
    expect(to.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("keeps state, nonce and the PKCE verifier in a signed, HttpOnly, Lax cookie for 10 minutes", async () => {
    const app = await createTestApp(fakeGoogle);
    const { res } = await start(app);
    const cookie = cookieNamed(res, "chukta_oauth")!;

    for (const part of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/api/v1/auth/google", "Max-Age=600"]) {
      expect(cookie).toContain(part);
    }
  });
});

describe("GET /auth/google/callback", () => {
  it("refuses a state that doesn't match the cookie, and starts no session", async () => {
    const app = await createTestApp(fakeGoogle);
    const { cookie } = await start(app);

    const res = await app.call("GET", "/auth/google/callback?state=forged&code=fake.x", { cookie });

    expect(location(res).href).toBe(`${WEB}/login/?google_error=failed`);
    expect(refreshCookie(res)).toBe("");
    expect(cookieNamed(res, "chukta_oauth")).toContain("Max-Age=0");
  });

  it.each([
    ["no cookie", async () => ""],
    ["a tampered cookie", async (cookie: string) => `${cookie.slice(0, -3)}abc`],
  ])("refuses a callback with %s", async (_label, mangle) => {
    const app = await createTestApp(fakeGoogle);
    const { to, cookie } = await start(app);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=fake.x`, {
      cookie: await mangle(cookie),
    });

    expect(location(res).searchParams.get("google_error")).toBe("failed");
  });

  it("refuses a callback more than 10 minutes after the start", async () => {
    const app = await createTestApp(fakeGoogle);
    const { to, cookie } = await start(app);
    app.clock.advance(10 * 60_000 + 1_000);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=fake.x`, { cookie });

    expect(location(res).searchParams.get("google_error")).toBe("failed");
  });

  it("explains a cancelled sign-in", async () => {
    const app = await createTestApp(fakeGoogle);
    const { to, cookie } = await start(app);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&error=access_denied`, { cookie });

    expect(location(res).href).toBe(`${WEB}/login/?google_error=cancelled`);
  });

  it("refuses an email Google hasn't verified", async () => {
    const unverified: GoogleSignIn = {
      authorizationUrl: (r) => `https://accounts.google.com/?state=${r.state}`,
      exchange: async () => {
        throw new GoogleSignInError("email_unverified");
      },
    };
    const app = await createTestApp({}, { google: unverified });
    const { to, cookie } = await start(app);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=c`, { cookie });

    expect(location(res).searchParams.get("google_error")).toBe("email_unverified");
  });

  it("asks a new Google account to verify a mobile number, creating nothing yet", async () => {
    const app = await createTestApp(fakeGoogle);

    const { to, pending, session } = await googleLogin(app);

    expect(to.href).toBe(`${WEB}/login/?via=google`);
    expect(pending).toMatch(/^chukta_google=.{40,}/);
    expect(session).toBe("");
    expect(await app.db.select().from(users)).toEqual([]);
  });

  it("says so when the Google email already belongs to an account, without linking it", async () => {
    const app = await createTestApp(fakeGoogle);
    await app.login("9876543210", { email: "asha@example.com" });

    const { to, session } = await googleLogin(app);

    expect(to.href).toBe(`${WEB}/login/?via=google&hint=email_in_use`);
    expect(session).toBe("");
    expect(await app.db.select().from(authIdentities)).toEqual([]);
  });

  it("signs a linked Google account straight in and sends it to the dashboard", async () => {
    const app = await createTestApp(fakeGoogle);
    const first = await googleLogin(app);
    await app.verify("9876543210", undefined, first.pending);
    await app.call("POST", "/auth/register", {
      body: { signupTicket: app.lastSignupTicket(), ...PROFILE },
      cookie: first.pending,
    });
    app.clock.advance(60_000);

    const again = await googleLogin(app);

    expect(again.to.href).toBe(`${WEB}/dashboard/`);
    expect(again.session).toMatch(/^chukta_rt=.{40,}$/);
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity!.lastUsedAt).toEqual(app.clock.now());
  });
});

describe("GET /auth/google/pending", () => {
  it("tells the login screen which Google account is waiting for a mobile number", async () => {
    const app = await createTestApp(fakeGoogle);
    const { pending } = await googleLogin(app);

    const res = await app.call("GET", "/auth/google/pending", { cookie: pending });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "asha@example.com", name: "Asha Sharma" });
  });

  it("says when there is none, e.g. after 15 minutes", async () => {
    const app = await createTestApp(fakeGoogle);
    const { pending } = await googleLogin(app);
    app.clock.advance(15 * 60_000 + 1_000);

    for (const cookie of [undefined, pending]) {
      const res = await app.call("GET", "/auth/google/pending", { cookie });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("google_pending_missing");
    }
  });
});

describe("verifying a mobile number after Google", () => {
  it("signs up a new number with the Google name and email offered for the profile", async () => {
    const app = await createTestApp(fakeGoogle);
    const { pending } = await googleLogin(app);

    const res = await app.verify("9876543210", undefined, pending);

    expect(await res.json()).toMatchObject({
      status: "signup_required",
      google: { email: "asha@example.com", name: "Asha Sharma" },
    });
  });

  it("registers the owner with Google linked, and marks the email verified when it is Google's", async () => {
    const app = await createTestApp(fakeGoogle);
    const { pending } = await googleLogin(app);
    await app.verify("9876543210", undefined, pending);

    const res = await app.call("POST", "/auth/register", {
      body: { signupTicket: app.lastSignupTicket(), ...PROFILE, email: "asha@example.com" },
      cookie: pending,
    });

    expect(res.status).toBe(201);
    expect(cookieNamed(res, "chukta_google")).toContain("Max-Age=0");
    const [user] = await app.db.select().from(users);
    expect(user!.emailVerifiedAt).toEqual(app.clock.now());
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity).toMatchObject({ userId: user!.id, provider: "google", subject: "fake:asha@example.com" });
  });

  it("leaves an email the owner typed instead unverified", async () => {
    const app = await createTestApp(fakeGoogle);
    const { pending } = await googleLogin(app);
    await app.verify("9876543210", undefined, pending);

    await app.call("POST", "/auth/register", {
      body: { signupTicket: app.lastSignupTicket(), ...PROFILE, email: "office@sunrise.example" },
      cookie: pending,
    });

    const [user] = await app.db.select().from(users);
    expect(user!.emailVerifiedAt).toBeNull();
  });

  it("connects Google to an existing account once its mobile number is verified", async () => {
    const app = await createTestApp(fakeGoogle);
    const owner = await app.login("9876543210", { email: "asha@example.com" });
    app.clock.advance(31_000);
    const { pending } = await googleLogin(app);

    const res = await app.verify("9876543210", undefined, pending);

    expect(await res.json()).toMatchObject({ status: "signed_in", linkedGoogle: true, user: { id: owner.body.user.id } });
    expect(cookieNamed(res, "chukta_google")).toContain("Max-Age=0");
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity).toMatchObject({ userId: owner.body.user.id, subject: "fake:asha@example.com" });
  });

  it("won't replace a Google account already connected to that number", async () => {
    const app = await createTestApp(fakeGoogle);
    const first = await googleLogin(app, { email: "asha@example.com", name: "Asha" });
    await app.verify("9876543210", undefined, first.pending);
    await app.call("POST", "/auth/register", { body: { signupTicket: app.lastSignupTicket(), ...PROFILE }, cookie: first.pending });
    app.clock.advance(31_000);
    const other = await googleLogin(app, { email: "someone@example.com", name: "Someone" });

    const res = await app.verify("9876543210", undefined, other.pending);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("google_already_linked");
    expect(refreshCookie(res)).toBe("");
    expect(await app.db.select().from(authIdentities)).toHaveLength(1);
  });

  it("won't connect a Google account that belongs to another owner", async () => {
    const app = await createTestApp(fakeGoogle);
    const asha = await googleLogin(app);
    await app.verify("9876543210", undefined, asha.pending);
    await app.call("POST", "/auth/register", { body: { signupTicket: app.lastSignupTicket(), ...PROFILE }, cookie: asha.pending });
    app.clock.advance(31_000);
    await app.login("9123456789");
    app.clock.advance(31_000);

    // The same Google account's pending cookie, replayed against the second owner's number.
    const res = await app.verify("9123456789", undefined, asha.pending);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("google_in_use");
  });

  it("reports an unexpected failure as failed, and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: GoogleSignIn = {
      authorizationUrl: (r) => `https://accounts.google.com/?state=${r.state}`,
      exchange: async () => {
        throw new Error("socket hang up");
      },
    };
    const app = await createTestApp({}, { google: broken });
    const { to, cookie } = await start(app);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=c`, { cookie });

    expect(location(res).searchParams.get("google_error")).toBe("failed");
    expect(String(error.mock.calls[0])).toContain("socket hang up");
    error.mockRestore();
  });
});

describe("unseal", () => {
  it("rejects a correctly signed value whose content isn't readable", () => {
    const body = "bm90LWpzb24";
    expect(unseal("s", "p", `${body}.${keyedHash("s", "p", body)}`, new Date())).toBeNull();
  });
});

describe("the fake account chooser", () => {
  it("is a small form outside production", async () => {
    const app = await createTestApp(fakeGoogle);
    const { to } = await start(app);

    const res = await app.call("GET", `${to.pathname.replace("/api/v1", "")}${to.search}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Choose an account");
    expect(html).toContain('action="/api/v1/auth/google/fake/approve"');
  });

  it("doesn't exist when real Google is configured", async () => {
    const app = await createTestApp({ google: { provider: "google", clientId: "id", clientSecret: "s" } });
    expect((await app.call("GET", "/auth/google/fake")).status).toBe(404);
  });

  it("only sends codes back to this API's own callback", async () => {
    const app = await createTestApp(fakeGoogle);
    const res = await app.call(
      "GET",
      `/auth/google/fake/approve?${new URLSearchParams({ redirect_uri: "https://evil.example/cb", state: "s", nonce: "n", email: "a@example.com", name: "A" })}`,
    );
    expect(res.status).toBe(400);
  });

});

describe("pkceChallenge", () => {
  it("hashes the verifier as RFC 7636 specifies", () => {
    // RFC 7636 appendix B test vector.
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
