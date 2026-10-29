import { centres, otpChallenges, users } from "@chukta/db";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/harness";

type App = Awaited<ReturnType<typeof createTestApp>>;

const MINUTE = 60_000;

/** A signed-in owner, with helpers to send and check codes as them. */
async function owner(config: Parameters<typeof createTestApp>[0] = {}) {
  const app = await createTestApp(config);
  const { body } = await app.login();
  const token = body.accessToken as string;
  const send = (phone: unknown = "98765 43210", ip?: string) =>
    app.call("POST", "/me/phone/verify", { token, body: { phone }, ip });
  const confirm = (code: string, phone = "98765 43210") =>
    app.call("POST", "/me/phone/confirm", { token, body: { phone, code } });
  const lastCode = () => app.sent.at(-1)!.code;
  return { app, token, send, confirm, lastCode, userId: body.user.id as string };
}

const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

/** Another owner whose number is already confirmed. */
async function confirmedElsewhere(app: App, phone: string) {
  const [centre] = await app.db.insert(centres).values({ ownerPhone: phone }).returning();
  await app.db.insert(users).values({ centreId: centre!.id, phone, phoneVerifiedAt: app.clock.now() });
}

describe("POST /me/phone/verify", () => {
  it("texts a 6-digit code, valid 5 minutes, to the owner's number", async () => {
    const { app, send } = await owner();

    const res = await send();

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(app.sent).toEqual([{ to: "+919876543210", code: expect.stringMatching(/^\d{6}$/) }]);
    const [challenge] = await app.db.select().from(otpChallenges);
    expect(challenge!.codeHash).not.toContain(app.sent[0]!.code);
  });

  it("texts a new number the owner wants to switch to", async () => {
    const { app, send } = await owner();

    expect((await send("91234 56789")).status).toBe(202);

    expect(app.sent[0]!.to).toBe("+919123456789");
  });

  it("explains a number that isn't an Indian mobile, sending nothing", async () => {
    const { app, send } = await owner();

    const res = await send("12345");

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: "invalid_request",
      fields: { phone: "Enter a 10-digit Indian mobile number." },
    });
    expect(app.sent).toEqual([]);
  });

  it("refuses a number another owner has confirmed, sending nothing", async () => {
    const { app, send } = await owner();
    await confirmedElsewhere(app, "+919123456789");

    const res = await send("91234 56789");

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("phone_taken");
    expect(app.sent).toEqual([]);
  });

  it("waits 30 seconds between codes, saying how long", async () => {
    const { app, send } = await owner();
    await send();
    app.clock.advance(10_000);

    const res = await send();

    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("otp_resend_too_soon");
    expect(res.headers.get("retry-after")).toBe("20");
    app.clock.advance(20_000);
    expect((await send()).status).toBe(202);
  });

  it("allows a limited number of codes per number each hour", async () => {
    const { app, send } = await owner({ otpLimits: { perPhonePerHour: 2, perIpPerHour: 100 } });
    await send();
    app.clock.advance(31_000);
    await send();
    app.clock.advance(31_000);

    const res = await send();

    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
  });

  it("says when the SMS can't be sent, and lets the owner try again at once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, send } = await owner();
    app.sms.sendOtp.mockRejectedValueOnce(new Error("gateway down"));

    const res = await send();

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("sms_unavailable");
    expect((await send()).status).toBe(202);
    error.mockRestore();
  });

  it("requires a valid access token", async () => {
    const app = await createTestApp();
    expect((await app.call("POST", "/me/phone/verify", { body: { phone: "9876543210" } })).status).toBe(401);
  });
});

describe("POST /me/phone/confirm", () => {
  it("confirms the number with the right code", async () => {
    const { app, send, confirm, lastCode, token } = await owner();
    await send("91234 56789");

    const res = await confirm(lastCode(), "91234 56789");

    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ phone: "+919123456789", phoneVerified: true });
    const [user] = await app.db.select().from(users);
    expect(user!.phoneVerifiedAt).toEqual(app.clock.now());
    const [centre] = await app.db.select().from(centres);
    expect(centre!.ownerPhone).toBe("+919123456789");
    expect((await (await app.call("GET", "/me", { token })).json()).user.phoneVerified).toBe(true);
  });

  it("accepts each code once", async () => {
    const { send, confirm, lastCode } = await owner();
    await send();
    const code = lastCode();
    await confirm(code);

    const again = await confirm(code);

    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("otp_expired");
  });

  it("says how many tries are left, and locks the code after 5 wrong ones", async () => {
    const { send, confirm, lastCode } = await owner();
    await send();
    const code = lastCode();

    const first = await confirm(wrong(code));
    expect(first.status).toBe(400);
    expect((await first.json()).error).toMatchObject({ code: "invalid_otp", attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) await confirm(wrong(code));
    const fifth = await confirm(wrong(code));
    expect(fifth.status).toBe(429);
    expect((await fifth.json()).error.code).toBe("too_many_attempts");

    expect((await confirm(code)).status).toBe(400);
  });

  it("refuses a code after 5 minutes", async () => {
    const { app, send, confirm, lastCode } = await owner();
    await send();
    app.clock.advance(5 * MINUTE + 1_000);

    const res = await confirm(lastCode());

    expect((await res.json()).error.code).toBe("otp_expired");
  });

  it("only takes a code for the number it was sent to", async () => {
    const { send, confirm, lastCode } = await owner();
    await send("91234 56789");

    const res = await confirm(lastCode(), "98765 43210");

    expect((await res.json()).error.code).toBe("otp_expired");
  });

  it("only takes a code the owner asked for themselves", async () => {
    const asha = await owner();
    const ravi = await asha.app.login("ravi@example.com");
    await asha.app.call("POST", "/me/phone/verify", { token: ravi.body.accessToken, body: { phone: "98765 43210" } });

    const res = await asha.confirm(asha.lastCode());

    expect((await res.json()).error.code).toBe("otp_expired");
  });

  it("refuses a number another owner confirmed meanwhile", async () => {
    const { app, send, confirm, lastCode } = await owner();
    await send("91234 56789");
    await confirmedElsewhere(app, "+919123456789");

    const res = await confirm(lastCode(), "91234 56789");

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("phone_taken");
  });

  it("checks the code is 6 digits before looking it up", async () => {
    const { confirm } = await owner();
    expect((await (await confirm("12a456")).json()).error.code).toBe("invalid_request");
  });
});
