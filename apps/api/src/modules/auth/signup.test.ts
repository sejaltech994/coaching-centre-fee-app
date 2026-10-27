import { centres, consents, signupTickets, users } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { createTestApp, PROFILE, refreshCookie } from "../../test/harness";

const MINUTE = 60_000;

describe("POST /auth/otp/verify for a number with no account", () => {
  it("hands out a 15-minute signup ticket instead of creating anything", async () => {
    const { verify, db } = await createTestApp();

    const res = await verify("98765 43210");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "signup_required",
      signupTicket: expect.stringMatching(/^.{40,}$/),
      phone: "+919876543210",
      expiresIn: 900,
    });
    expect(refreshCookie(res)).toBe("");
    expect(await db.select().from(users)).toEqual([]);
    expect(await db.select().from(centres)).toEqual([]);

    const [ticket] = await db.select().from(signupTickets);
    expect(ticket!.phone).toBe("+919876543210");
    expect(ticket!.tokenHash).not.toContain(body.signupTicket);
  });

  it("lets the owner ask for a new code straight after a code was used", async () => {
    const { verify, call } = await createTestApp();
    await verify();

    const again = await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });

    expect(again.status).toBe(202);
  });
});

describe("POST /auth/register", () => {
  async function ticketFor(app: Awaited<ReturnType<typeof createTestApp>>, phone = "9876543210") {
    return (await (await app.verify(phone)).json()).signupTicket as string;
  }

  it("creates the owner, their centre and the consent record, and signs them in", async () => {
    const app = await createTestApp();
    const signupTicket = await ticketFor(app);

    const res = await app.call("POST", "/auth/register", {
      body: { signupTicket, ...PROFILE, email: "Asha@Example.com" },
      ip: "203.0.113.7",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "signed_in",
      isNewAccount: true,
      expiresIn: 900,
      user: { phone: "+919876543210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
      centre: { name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free" },
    });
    expect(body.accessToken.split(".")).toHaveLength(3);
    expect(refreshCookie(res)).toMatch(/^chukta_rt=.{40,}$/);

    const [centre] = await app.db.select().from(centres);
    expect(centre).toMatchObject({ ownerPhone: "+919876543210", name: "Sunrise Classes", city: "Pune" });
    const [consent] = await app.db.select().from(consents);
    expect(consent).toMatchObject({ userId: body.user.id, kind: "terms_and_privacy", ip: "203.0.113.7" });
    expect(consent!.version).toMatch(/^\d{4}-\d{2}$/);
  });

  it("names every field at fault", async () => {
    const app = await createTestApp();
    const signupTicket = await ticketFor(app);

    const res = await app.call("POST", "/auth/register", {
      body: { signupTicket, fullName: "", centreName: "", city: "", centreType: "bakery", acceptedTerms: false },
    });

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("invalid_request");
    expect(error.fields).toMatchObject({ acceptedTerms: "Accept the terms and privacy notice to continue." });
    expect(Object.keys(error.fields).sort()).toEqual(["acceptedTerms", "centreName", "centreType", "city", "fullName"]);
  });

  it.each([
    ["is made up", async () => "not-a-real-ticket"],
    ["is missing", async () => undefined],
  ])("refuses a ticket that %s", async (_label, makeTicket) => {
    const app = await createTestApp();

    const res = await app.call("POST", "/auth/register", { body: { signupTicket: await makeTicket(), ...PROFILE } });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("signup_ticket_invalid");
  });

  it("refuses a ticket after 15 minutes", async () => {
    const app = await createTestApp();
    const signupTicket = await ticketFor(app);
    app.clock.advance(15 * MINUTE + 1_000);

    const res = await app.call("POST", "/auth/register", { body: { signupTicket, ...PROFILE } });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("signup_ticket_invalid");
  });

  it("accepts each ticket only once", async () => {
    const app = await createTestApp();
    const signupTicket = await ticketFor(app);
    expect((await app.call("POST", "/auth/register", { body: { signupTicket, ...PROFILE } })).status).toBe(201);

    const again = await app.call("POST", "/auth/register", { body: { signupTicket, ...PROFILE } });

    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("signup_ticket_invalid");
    expect(await app.db.select().from(users)).toHaveLength(1);
  });

  it("refuses an email another owner has, ignoring case, and keeps the ticket for a retry", async () => {
    const app = await createTestApp();
    await app.login("9876543210", { email: "asha@example.com" });
    const signupTicket = await ticketFor(app, "9123456789");

    const taken = await app.call("POST", "/auth/register", { body: { signupTicket, ...PROFILE, email: "ASHA@example.com" } });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error).toMatchObject({ code: "email_taken", fields: { email: expect.any(String) } });

    const retry = await app.call("POST", "/auth/register", { body: { signupTicket, ...PROFILE, email: "ravi@example.com" } });
    expect(retry.status).toBe(201);
  });

  it("does not create a second account if the number signed up meanwhile", async () => {
    const app = await createTestApp();
    const first = await ticketFor(app);
    app.clock.advance(31_000);
    const second = await ticketFor(app);
    expect((await app.call("POST", "/auth/register", { body: { signupTicket: first, ...PROFILE } })).status).toBe(201);

    const res = await app.call("POST", "/auth/register", { body: { signupTicket: second, ...PROFILE } });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("account_exists");
    expect(await app.db.select().from(users)).toHaveLength(1);
  });
});

describe("POST /auth/otp/verify for a returning owner", () => {
  it("signs them into the same centre", async () => {
    const app = await createTestApp();
    const first = await app.login();
    app.clock.advance(31_000);

    const res = await app.verify();
    const body = await res.json();

    expect(body).toMatchObject({ status: "signed_in", isNewAccount: false, user: { id: first.body.user.id } });
    expect(body.centre.id).toBe(first.body.centre.id);
    expect(refreshCookie(res)).toMatch(/^chukta_rt=/);
  });
});

describe("GET /me", () => {
  it("returns the signed-in owner and their centre", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("GET", "/me", { token: body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: body.user.id, phone: "+919876543210", fullName: "Asha Sharma", email: null, role: "owner" },
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
