import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/harness";

describe("GET /centre", () => {
  it("returns the signed-in owner's centre", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("GET", "/centre", { token: body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      centre: { id: body.centre.id, name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" },
    });
  });

  it("only ever shows an owner their own centre", async () => {
    const { login, call, clock } = await createTestApp();
    const asha = await login("asha@example.com");
    clock.advance(31_000);
    const ravi = await login("ravi@example.com");

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

describe("PATCH /centre", () => {
  const SUNRISE_ACADEMY = { centreName: " Sunrise Academy ", city: "Patna", centreType: "tuition" };

  it("changes the centre's name, city and type, and returns it", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("PATCH", "/centre", { token: body.accessToken, body: SUNRISE_ACADEMY });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      centre: {
        id: body.centre.id,
        name: "Sunrise Academy",
        city: "Patna",
        centreType: "tuition",
        plan: "free",
        timezone: "Asia/Kolkata",
      },
    });
    expect((await (await call("GET", "/me", { token: body.accessToken })).json()).centre.name).toBe("Sunrise Academy");
  });

  it("names every field at fault and changes nothing", async () => {
    const { login, call } = await createTestApp();
    const { body } = await login();

    const res = await call("PATCH", "/centre", {
      token: body.accessToken,
      body: { centreName: "", city: "", centreType: "bakery" },
    });

    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fields).sort()).toEqual(["centreName", "centreType", "city"]);
    expect((await (await call("GET", "/me", { token: body.accessToken })).json()).centre.name).toBe("Sunrise Classes");
  });

  it("only ever changes the owner's own centre", async () => {
    const { login, call } = await createTestApp();
    const asha = await login("asha@example.com");
    const ravi = await login("ravi@example.com");

    await call("PATCH", "/centre", { token: ravi.body.accessToken, body: SUNRISE_ACADEMY });

    expect((await (await call("GET", "/me", { token: asha.body.accessToken })).json()).centre.name).toBe("Sunrise Classes");
  });

  it("requires a valid access token", async () => {
    const { call } = await createTestApp();
    expect((await call("PATCH", "/centre", { body: SUNRISE_ACADEMY })).status).toBe(401);
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

  it("reports readiness, including the database, without authentication", async () => {
    const { call } = await createTestApp();
    const res = await call("GET", "/health/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports not ready when the database can't be reached, without details", async () => {
    const { app, db } = await createTestApp();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection refused to 10.0.0.5"));

    const res = await app.request("/api/v1/health/ready");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable", database: "unreachable" });
    expect(String(error.mock.calls[0])).toContain("connection refused");
    error.mockRestore();
  });

  it("reports health without authentication", async () => {
    const { call } = await createTestApp();
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
