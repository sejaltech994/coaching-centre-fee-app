import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

describe("GET /centre", () => {
  it("returns the signed-in owner's centre", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("GET", "/centre", { token: body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      centre: { id: body.centre.id, name: null, plan: "free", timezone: "Asia/Kolkata" },
    });
  });

  it("only ever shows an owner their own centre", async () => {
    const { login, call, clock } = await createTestApp();
    const asha = await login("9876543210");
    clock.advance(31_000);
    const ravi = await login("9123456789");

    const forAsha = await (await call("GET", "/centre", { token: asha.body.accessToken })).json();
    const forRavi = await (await call("GET", "/centre", { token: ravi.body.accessToken })).json();

    expect(forAsha.centre.id).toBe(asha.body.centre.id);
    expect(forRavi.centre.id).toBe(ravi.body.centre.id);
    expect(forAsha.centre.id).not.toBe(forRavi.centre.id);
  });

  it("requires a valid access token", async () => {
    const { call } = await createTestApp();

    for (const token of [undefined, "not.a.jwt", "eyJhbGciOiJIUzI1NiJ9.e30.c2lnbmF0dXJl"]) {
      const res = await call("GET", "/centre", { token });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthenticated");
    }
  });

  it("rejects an access token after 15 minutes", async () => {
    const { login, call, clock } = await createTestApp();
    const { body } = await login();
    clock.advance(15 * 60_000 + 1_000);

    expect((await call("GET", "/centre", { token: body.accessToken })).status).toBe(401);
  });

  it("rejects a token signed with a different secret", async () => {
    const issuer = await createTestApp({ jwtSecret: "another-secret-that-is-also-32-characters-long" });
    const { body } = await issuer.login();
    const { call } = await createTestApp();

    expect((await call("GET", "/centre", { token: body.accessToken })).status).toBe(401);
  });
});

describe("the API", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const { call } = await createTestApp();
    const res = await call("GET", "/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such endpoint." } });
  });

  it("lets the web app call it with cookies, and no other site", async () => {
    const { app } = await createTestApp();
    const preflight = (origin: string) =>
      app.request("/api/v1/auth/refresh", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });

    const allowed = await preflight("http://localhost:3000");
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const other = await preflight("https://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reports health without authentication", async () => {
    const { call } = await createTestApp();
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
