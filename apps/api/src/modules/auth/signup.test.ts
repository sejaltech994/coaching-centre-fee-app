import { authIdentities, centres, consents, users } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { cookieNamed, createTestApp, PROFILE, refreshCookie } from "../../test/harness";

describe("POST /auth/register, after Google sign-in", () => {
  it("creates the owner, their centre, the consent and the Google link, and signs them in", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin({ email: "asha@example.com", name: "Asha S" });

    const res = await app.call("POST", "/auth/register", { body: PROFILE, cookie: pending, ip: "203.0.113.7" });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "signed_in",
      isNewAccount: true,
      expiresIn: 900,
      user: { phone: "+919876543210", phoneVerified: false, fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
      centre: { name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free" },
    });
    expect(body.accessToken.split(".")).toHaveLength(3);
    expect(refreshCookie(res)).toMatch(/^chukta_rt=.{40,}$/);
    expect(cookieNamed(res, "chukta_google")).toContain("Max-Age=0");

    const [user] = await app.db.select().from(users);
    // Google has confirmed the email; the mobile number waits for its own code.
    expect(user).toMatchObject({ email: "asha@example.com", emailVerifiedAt: app.clock.now(), phoneVerifiedAt: null });
    const [centre] = await app.db.select().from(centres);
    expect(centre).toMatchObject({ ownerPhone: "+919876543210", name: "Sunrise Classes", city: "Pune" });
    const [consent] = await app.db.select().from(consents);
    expect(consent).toMatchObject({ userId: body.user.id, kind: "terms_and_privacy", ip: "203.0.113.7" });
    expect(consent!.version).toMatch(/^\d{4}-\d{2}$/);
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity).toMatchObject({ userId: body.user.id, provider: "google", subject: "fake:asha@example.com" });
  });

  it("needs a Google sign-in first, e.g. not one that expired after 15 minutes", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin();
    app.clock.advance(15 * 60_000 + 1_000);

    for (const cookie of [undefined, pending]) {
      const res = await app.call("POST", "/auth/register", { body: PROFILE, cookie });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("google_pending_missing");
    }
    expect(await app.db.select().from(users)).toEqual([]);
  });

  it("names every field at fault, and keeps the Google sign-in for a retry", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin();

    const res = await app.call("POST", "/auth/register", {
      body: { fullName: "", phone: "123", centreName: "", city: "", centreType: "bakery", acceptedTerms: false },
      cookie: pending,
    });

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("invalid_request");
    expect(error.fields).toMatchObject({ phone: "Enter a 10-digit Indian mobile number." });
    expect(Object.keys(error.fields).sort()).toEqual(["acceptedTerms", "centreName", "centreType", "city", "fullName", "phone"]);
    expect(cookieNamed(res, "chukta_google")).toBeUndefined();
    expect((await app.call("POST", "/auth/register", { body: PROFILE, cookie: pending })).status).toBe(201);
  });

  it("lets two owners type the same unconfirmed mobile number", async () => {
    const app = await createTestApp();
    await app.login("asha@example.com");

    const ravi = await app.login("ravi@example.com", { fullName: "Ravi Kumar" });

    expect(ravi.body.user).toMatchObject({ phone: "+919876543210", email: "ravi@example.com" });
  });

  it("creates one account per Google account, even if its sign-in is replayed", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin();
    expect((await app.call("POST", "/auth/register", { body: PROFILE, cookie: pending })).status).toBe(201);

    const again = await app.call("POST", "/auth/register", { body: PROFILE, cookie: pending });

    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("google_in_use");
    expect(await app.db.select().from(users)).toHaveLength(1);
  });

  it("won't create a second account for an email that already has one", async () => {
    const app = await createTestApp();
    const { pending } = await app.googleLogin({ email: "asha@example.com" });
    // An account from before Google sign-in, with the same email.
    const [centre] = await app.db.insert(centres).values({ ownerPhone: "+919123456789" }).returning();
    await app.db.insert(users).values({ centreId: centre!.id, phone: "+919123456789", email: "Asha@Example.com" });

    const res = await app.call("POST", "/auth/register", { body: PROFILE, cookie: pending });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("email_in_use");
    expect(await app.db.select().from(authIdentities)).toEqual([]);
  });
});

describe("signing in with a mobile number", () => {
  it.each(["/auth/otp/request", "/auth/otp/verify"])("is withdrawn: %s no longer exists", async (path) => {
    const app = await createTestApp();

    const res = await app.call("POST", path, { body: { phone: "9876543210", code: "123456" } });

    expect(res.status).toBe(404);
  });
});

describe("GET /me", () => {
  it("returns the signed-in owner and their centre", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("GET", "/me", { token: body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: body.user.id,
        phone: "+919876543210",
        phoneVerified: false,
        fullName: "Asha Sharma",
        email: "asha@example.com",
        role: "owner",
      },
      centre: {
        id: body.centre.id,
        name: "Sunrise Classes",
        city: "Pune",
        centreType: "coaching",
        plan: "free",
        timezone: "Asia/Kolkata",
      },
    });
  });

  it("requires a valid access token", async () => {
    const { call } = await createTestApp();
    const res = await call("GET", "/me");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });
});
