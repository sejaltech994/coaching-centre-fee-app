import { authIdentities, centres, users } from "@chukta/db";
import { GoogleSignInError, type GoogleSignIn } from "@chukta/integrations";
import { decodeProtectedHeader } from "jose";
import { describe, expect, it, vi } from "vitest";
import { pkceChallenge, seal, unseal } from "../../lib/crypto";
import { cookieNamed, createTestApp, location, refreshCookie } from "../../test/harness";

type App = Awaited<ReturnType<typeof createTestApp>>;

const WEB = "http://localhost:3000";
const start = (app: App) => app.startGoogle();

describe("GET /auth/google/start", () => {
  it("sends the browser back with an explanation when Google sign-in isn't set up", async () => {
    const app = await createTestApp({ google: null });
    const { res, to } = await start(app);

    expect(res.status).toBe(302);
    expect(to.href).toBe(`${WEB}/login/?google_error=unavailable`);
  });

  it("sends the browser to the account chooser with state, nonce and an S256 PKCE challenge", async () => {
    const app = await createTestApp();
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
    const app = await createTestApp();
    const { res } = await start(app);
    const cookie = cookieNamed(res, "chukta_oauth")!;

    for (const part of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/api/v1/auth/google", "Max-Age=600"]) {
      expect(cookie).toContain(part);
    }
  });
});

describe("GET /auth/google/callback", () => {
  it("refuses a state that doesn't match the cookie, and starts no session", async () => {
    const app = await createTestApp();
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
    const app = await createTestApp();
    const { to, cookie } = await start(app);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=fake.x`, {
      cookie: await mangle(cookie),
    });

    expect(location(res).searchParams.get("google_error")).toBe("failed");
  });

  it("refuses a callback more than 10 minutes after the start", async () => {
    const app = await createTestApp();
    const { to, cookie } = await start(app);
    app.clock.advance(10 * 60_000 + 1_000);

    const res = await app.call("GET", `/auth/google/callback?state=${to.searchParams.get("state")}&code=fake.x`, { cookie });

    expect(location(res).searchParams.get("google_error")).toBe("failed");
  });

  it("explains a cancelled sign-in", async () => {
    const app = await createTestApp();
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

  it("sends a new Google account to sign-up, creating nothing yet", async () => {
    const app = await createTestApp();

    const { to, pending, session } = await app.googleLogin();

    expect(to.href).toBe(`${WEB}/signup/`);
    expect(pending).toMatch(/^chukta_google=.{40,}/);
    expect(session).toBe("");
    expect(await app.db.select().from(users)).toEqual([]);
  });

  it("explains when the Google email belongs to an account from before Google sign-in, without linking it", async () => {
    const app = await createTestApp();
    const [centre] = await app.db.insert(centres).values({ ownerPhone: "+919876543210" }).returning();
    await app.db.insert(users).values({ centreId: centre!.id, phone: "+919876543210", email: "asha@example.com" });

    const { to, pending, session } = await app.googleLogin();

    expect(to.href).toBe(`${WEB}/login/?google_error=email_in_use`);
    expect(pending).toBe("");
    expect(session).toBe("");
    expect(await app.db.select().from(authIdentities)).toEqual([]);
  });

  it("signs a linked Google account straight in and sends it to the dashboard", async () => {
    const app = await createTestApp();
    await app.login();
    app.clock.advance(60_000);

    const again = await app.googleLogin();

    expect(again.to.href).toBe(`${WEB}/dashboard/`);
    expect(again.session).toMatch(/^chukta_rt=.{40,}$/);
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity!.lastUsedAt).toEqual(app.clock.now());
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

describe("GET /auth/google/pending", () => {
  it("tells the sign-up screen which Google account is signing up", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin();

    const res = await app.call("GET", "/auth/google/pending", { cookie: pending });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "asha@example.com", name: "Asha Sharma" });
  });

  it("says when there is none, e.g. after 15 minutes", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin();
    app.clock.advance(15 * 60_000 + 1_000);

    for (const cookie of [undefined, pending]) {
      const res = await app.call("GET", "/auth/google/pending", { cookie });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("google_pending_missing");
    }
  });
});

describe("seal and unseal", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it("is a standard signed JWT (HS256), not home-made crypto", async () => {
    const sealed = await seal("s", "p", { a: 1 }, later(60));
    expect(decodeProtectedHeader(sealed).alg).toBe("HS256");
    expect(await unseal("s", "p", sealed, now)).toEqual({ a: 1 });
  });

  it.each([
    ["another purpose", "s", "q", 0],
    ["another secret", "t", "p", 0],
    ["expiry", "s", "p", 61],
  ])("refuses a value past its %s", async (_, secret, purpose, wait) => {
    const sealed = await seal("s", "p", { a: 1 }, later(60));
    expect(await unseal(secret, purpose, sealed, later(wait))).toBeNull();
  });

  it.each([undefined, "", "not-a-jwt", "a.b.c"])("refuses %j", async (value) => {
    expect(await unseal("s", "p", value, now)).toBeNull();
  });
});

describe("the fake account chooser", () => {
  it("is a small form outside production", async () => {
    const app = await createTestApp();
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
    const app = await createTestApp();
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
