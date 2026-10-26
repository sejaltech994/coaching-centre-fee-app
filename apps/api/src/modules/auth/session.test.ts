import { describe, expect, it } from "vitest";
import { createTestApp, refreshCookie } from "../../test/harness";

const DAY = 24 * 60 * 60_000;

describe("POST /auth/refresh", () => {
  it("swaps a refresh cookie for a new access token and a new cookie", async () => {
    const { login, call } = await createTestApp();
    const { cookie } = await login();

    const res = await call("POST", "/auth/refresh", { cookie });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken.split(".")).toHaveLength(3);
    expect(body.expiresIn).toBe(900);
    const next = refreshCookie(res);
    expect(next).toMatch(/^chukta_rt=.+/);
    expect(next).not.toBe(cookie);
  });

  it("treats reuse of an old refresh token as theft and signs the session out", async () => {
    const { login, call } = await createTestApp();
    const { cookie: first } = await login();
    const second = refreshCookie(await call("POST", "/auth/refresh", { cookie: first }));

    const reused = await call("POST", "/auth/refresh", { cookie: first });
    expect(reused.status).toBe(401);
    expect((await reused.json()).error.code).toBe("refresh_token_reused");

    // The token issued in the meantime is revoked with the rest of its family.
    const afterTheft = await call("POST", "/auth/refresh", { cookie: second });
    expect(afterTheft.status).toBe(401);
  });

  it("does not sign out other devices when one session is compromised", async () => {
    const { login, call, clock } = await createTestApp();
    const phone = await login();
    clock.advance(31_000);
    const laptop = await login();

    const rotated = await call("POST", "/auth/refresh", { cookie: phone.cookie });
    await call("POST", "/auth/refresh", { cookie: phone.cookie }); // reuse: phone family revoked
    expect((await call("POST", "/auth/refresh", { cookie: refreshCookie(rotated) })).status).toBe(401);

    expect((await call("POST", "/auth/refresh", { cookie: laptop.cookie })).status).toBe(200);
  });

  it("expires refresh tokens after 30 days", async () => {
    const { login, call, clock } = await createTestApp();
    const { cookie } = await login();
    clock.advance(30 * DAY + 1_000);

    const res = await call("POST", "/auth/refresh", { cookie });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });

  it.each([
    ["no cookie", undefined],
    ["an unknown token", "chukta_rt=not-a-real-token"],
  ])("rejects %s", async (_label, cookie) => {
    const { call } = await createTestApp();
    const res = await call("POST", "/auth/refresh", { cookie });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const { login, call } = await createTestApp();
    const { cookie } = await login();

    const res = await call("POST", "/auth/logout", { cookie });

    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await call("POST", "/auth/refresh", { cookie })).status).toBe(401);
  });

  it("succeeds even without a session, so logging out twice is harmless", async () => {
    const { call } = await createTestApp();
    expect((await call("POST", "/auth/logout")).status).toBe(204);
  });
});
