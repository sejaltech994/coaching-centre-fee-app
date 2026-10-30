import { describe, expect, it } from "vitest";
import { createTestApp, refreshCookie } from "../../test/harness";

const LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The same owner signed in on a laptop, then a phone. */
async function twoDevices() {
  const app = await createTestApp();
  const laptop = await app.login("asha@example.com", {}, { userAgent: LAPTOP });
  app.clock.advance(10 * MINUTE);
  const phone = await app.login("asha@example.com", {}, { userAgent: PHONE });
  const list = async (token = phone.body.accessToken) => (await app.call("GET", "/me/sessions", { token })).json();
  return { app, laptop, phone, list };
}

describe("GET /me/sessions", () => {
  it("lists the owner's signed-in devices, this one first", async () => {
    const { app, laptop, phone, list } = await twoDevices();
    const start = new Date(app.clock.now().getTime() - 10 * MINUTE).toISOString();

    const { sessions } = await list();

    expect(sessions).toEqual([
      { id: expect.any(String), device: "Chrome on Android", city: null, signedInAt: app.clock.now().toISOString(), lastActiveAt: app.clock.now().toISOString(), current: true },
      { id: expect.any(String), device: "Chrome on Windows", city: null, signedInAt: start, lastActiveAt: start, current: false },
    ]);
    expect((await list(laptop.body.accessToken)).sessions.map((s: { current: boolean }) => s.current)).toEqual([true, false]);
    expect(phone.body.accessToken).not.toBe(laptop.body.accessToken);
  });

  it("shows the city each device was last seen in, from Cloudflare", async () => {
    const { app, laptop, list } = await twoDevices();

    await app.app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { cookie: laptop.cookie, "user-agent": LAPTOP, "cf-ipcity": "Pune" },
    });

    const { sessions } = await list();
    expect(sessions.map((s: { device: string; city: string | null }) => [s.device, s.city])).toEqual([
      ["Chrome on Android", null],
      ["Chrome on Windows", "Pune"],
    ]);
  });

  it("keeps a device's place when its session is refreshed, and shows when it was last used", async () => {
    const { app, laptop, list } = await twoDevices();
    app.clock.advance(5 * MINUTE);

    await app.call("POST", "/auth/refresh", { cookie: laptop.cookie, userAgent: LAPTOP });
    const { sessions } = await list();

    expect(sessions).toHaveLength(2);
    const onLaptop = sessions.find((s: { device: string }) => s.device === "Chrome on Windows");
    expect(onLaptop.lastActiveAt).toBe(app.clock.now().toISOString());
  });

  it("leaves out devices that signed out or whose session ran out", async () => {
    const { app, laptop, list } = await twoDevices();
    await app.call("POST", "/auth/logout", { cookie: laptop.cookie });
    expect((await list()).sessions).toHaveLength(1);

    app.clock.advance(30 * DAY + MINUTE);
    const fresh = await app.login("asha@example.com", {}, { userAgent: LAPTOP });
    expect((await list(fresh.body.accessToken)).sessions.map((s: { device: string }) => s.device)).toEqual(["Chrome on Windows"]);
  });

  it("shows only the signed-in owner's devices", async () => {
    const { app, list } = await twoDevices();
    const ravi = await app.login("ravi@example.com", {}, { userAgent: LAPTOP });

    expect((await list(ravi.body.accessToken)).sessions).toHaveLength(1);
    expect((await list()).sessions).toHaveLength(2);
  });

  it("requires a valid access token", async () => {
    const app = await createTestApp();
    expect((await app.call("GET", "/me/sessions")).status).toBe(401);
  });
});

describe("DELETE /me/sessions/:id", () => {
  it("signs that device out: it can no longer refresh", async () => {
    const { app, laptop, phone, list } = await twoDevices();
    const other = (await list()).sessions.find((s: { current: boolean }) => !s.current);

    const res = await app.call("DELETE", `/me/sessions/${other.id}`, { token: phone.body.accessToken });

    expect(res.status).toBe(204);
    expect((await app.call("POST", "/auth/refresh", { cookie: laptop.cookie })).status).toBe(401);
    expect((await app.call("POST", "/auth/refresh", { cookie: phone.cookie })).status).toBe(200);
    expect((await list()).sessions).toHaveLength(1);
  });

  it("can't touch another owner's device", async () => {
    const { app, phone, list } = await twoDevices();
    const ravi = await app.login("ravi@example.com");
    const [asha] = (await list()).sessions;

    const res = await app.call("DELETE", `/me/sessions/${asha.id}`, { token: ravi.body.accessToken });

    expect(res.status).toBe(404);
    expect((await app.call("POST", "/auth/refresh", { cookie: phone.cookie })).status).toBe(200);
  });

  it("says so for a session that isn't there", async () => {
    const { app, phone } = await twoDevices();
    const res = await app.call("DELETE", "/me/sessions/00000000-0000-4000-8000-000000000000", { token: phone.body.accessToken });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});

describe("POST /me/sessions/sign-out-others", () => {
  it("signs out every other device and keeps this one", async () => {
    const { app, laptop, phone, list } = await twoDevices();
    const tablet = await app.login("asha@example.com");

    const res = await app.call("POST", "/me/sessions/sign-out-others", { token: phone.body.accessToken });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedOut: 2 });
    for (const gone of [laptop, tablet]) expect((await app.call("POST", "/auth/refresh", { cookie: gone.cookie })).status).toBe(401);
    const kept = await app.call("POST", "/auth/refresh", { cookie: phone.cookie });
    expect(kept.status).toBe(200);
    expect(refreshCookie(kept)).toMatch(/^chukta_rt=/);
    expect((await list()).sessions).toHaveLength(1);
  });
});
