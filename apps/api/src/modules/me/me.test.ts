import { users } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

describe("PATCH /me", () => {
  it("changes the owner's name, trimmed, and returns them", async () => {
    const { login, call, db } = await createTestApp();
    const { body } = await login();

    const res = await call("PATCH", "/me", { token: body.accessToken, body: { fullName: "  Asha S. Sharma " } });

    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: body.user.id, fullName: "Asha S. Sharma", email: "asha@example.com" });
    const [user] = await db.select().from(users);
    expect(user!.name).toBe("Asha S. Sharma");
  });

  it("names the field at fault and changes nothing", async () => {
    const { login, call, db } = await createTestApp();
    const { body } = await login();

    const res = await call("PATCH", "/me", { token: body.accessToken, body: { fullName: "" } });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "invalid_request", fields: { fullName: "Enter your name." } });
    const [user] = await db.select().from(users);
    expect(user!.name).toBe("Asha Sharma");
  });

  it("requires a valid access token", async () => {
    const { call } = await createTestApp();
    expect((await call("PATCH", "/me", { body: { fullName: "Mallory" } })).status).toBe(401);
  });
});

describe("GET /me/identities", () => {
  it("lists how the owner signs in: their Google account", async () => {
    const { login, call, clock } = await createTestApp();
    const { body } = await login();

    const res = await call("GET", "/me/identities", { token: body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      identities: [{ provider: "google", email: "asha@example.com", lastUsedAt: clock.now().toISOString() }],
    });
  });

  it("shows only the signed-in owner's", async () => {
    const { login, call } = await createTestApp();
    await login("asha@example.com");
    const ravi = await login("ravi@example.com");

    const { identities } = await (await call("GET", "/me/identities", { token: ravi.body.accessToken })).json();

    expect(identities.map((i: { email: string }) => i.email)).toEqual(["ravi@example.com"]);
  });
});
