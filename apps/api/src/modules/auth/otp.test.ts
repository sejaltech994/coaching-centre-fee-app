import { otpChallenges } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

const MINUTE = 60_000;

describe("POST /auth/otp/request", () => {
  it("sends a 6-digit code to the normalised number and stores only its hash", async () => {
    const { call, sent, db } = await createTestApp();

    const res = await call("POST", "/auth/otp/request", { body: { phone: "+91 98765-43210" } });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("+919876543210");
    expect(sent[0]!.code).toMatch(/^\d{6}$/);

    const [challenge] = await db.select().from(otpChallenges);
    expect(challenge!.phone).toBe("+919876543210");
    expect(challenge!.codeHash).not.toContain(sent[0]!.code);
    expect(challenge!.requestedIp).toBe("203.0.113.10");
  });

  it("rejects a number that isn't an Indian mobile", async () => {
    const { call, sent } = await createTestApp();

    const res = await call("POST", "/auth/otp/request", { body: { phone: "12345" } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid_phone", message: "Enter a 10-digit Indian mobile number." },
    });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ["no body", undefined],
    ["not JSON", "{oops"],
    ["phone missing", {}],
    ["phone not a string", { phone: 9876543210 }],
  ])("rejects a malformed request (%s)", async (_label, body) => {
    const { call } = await createTestApp();
    const res = await call("POST", "/auth/otp/request", { body });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("asks the user to wait 30 seconds before resending", async () => {
    const { call, clock, sent } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    clock.advance(10_000);

    const res = await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("20");
    expect((await res.json()).error.code).toBe("otp_resend_too_soon");
    expect(sent).toHaveLength(1);
  });

  it("replaces the previous code when a new one is sent", async () => {
    const { call, clock, sent } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    const oldCode = sent[0]!.code;
    clock.advance(31_000);
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });

    const res = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: oldCode } });

    // The new code is a different random number, so the old one must not work…
    if (oldCode !== sent[1]!.code) expect(res.status).toBe(400);
    // …and the new one must.
    const ok = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: sent[1]!.code } });
    expect(ok.status).toBe(200);
  });

  it("allows at most 5 codes per number per hour", async () => {
    const { call, clock } = await createTestApp();
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } })).status).toBe(202);
      clock.advance(31_000);
    }

    const blocked = await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("rate_limited");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    clock.advance(60 * MINUTE);
    expect((await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } })).status).toBe(202);
  });

  it("allows at most 20 codes per IP address per hour", async () => {
    const { call } = await createTestApp();
    for (let i = 0; i < 20; i++) {
      const phone = `98765432${String(i).padStart(2, "0")}`;
      expect((await call("POST", "/auth/otp/request", { body: { phone }, ip: "198.51.100.1" })).status).toBe(202);
    }

    const blocked = await call("POST", "/auth/otp/request", { body: { phone: "9123456789" }, ip: "198.51.100.1" });
    expect(blocked.status).toBe(429);

    const otherIp = await call("POST", "/auth/otp/request", { body: { phone: "9123456789" }, ip: "198.51.100.2" });
    expect(otherIp.status).toBe(202);
  });

  it("uses the configured hourly limits", async () => {
    const { call } = await createTestApp({ otpLimits: { perPhonePerHour: 5, perIpPerHour: 2 } });
    for (const phone of ["9876543210", "9876543211"]) {
      expect((await call("POST", "/auth/otp/request", { body: { phone } })).status).toBe(202);
    }
    expect((await call("POST", "/auth/otp/request", { body: { phone: "9876543212" } })).status).toBe(429);
  });

  it("reports when the SMS could not be sent, and lets the user retry at once", async () => {
    const { call, sms } = await createTestApp();
    sms.sendOtp.mockRejectedValueOnce(new Error("provider down"));

    const res = await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("sms_unavailable");

    expect((await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } })).status).toBe(202);
  });
});

describe("POST /auth/otp/verify", () => {
  it("logs a new owner in, creating their centre on first login", async () => {
    const { login } = await createTestApp();

    const { res, body, cookie } = await login("98765 43210");

    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(true);
    expect(body.expiresIn).toBe(900);
    expect(body.accessToken.split(".")).toHaveLength(3);
    expect(body.user).toMatchObject({ phone: "+919876543210", role: "owner", name: null });
    expect(body.centre).toMatchObject({ plan: "free", name: null });
    expect(cookie).toMatch(/^chukta_rt=.{40,}$/);
  });

  it("sets the refresh token as an HttpOnly, Secure, SameSite=Strict cookie for 30 days", async () => {
    const { login } = await createTestApp();
    const { res } = await login();
    const header = res.headers.get("set-cookie")!;

    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/api/v1/auth");
    expect(header).toContain("Max-Age=2592000");
  });

  it("logs a returning owner into the same centre", async () => {
    const { login, clock } = await createTestApp();
    const first = await login();
    clock.advance(31_000);

    const second = await login();

    expect(second.body.isNewAccount).toBe(false);
    expect(second.body.centre.id).toBe(first.body.centre.id);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it("rejects a wrong code and says how many attempts are left", async () => {
    const { call, lastCode } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    const wrong = lastCode() === "000000" ? "111111" : "000000";

    const res = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: wrong } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid_otp", message: "That code is not right. 4 attempts left.", attemptsLeft: 4 },
    });
  });

  it("locks the code after 5 wrong attempts, even if the right code follows", async () => {
    const { call, lastCode } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i++) {
      expect((await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: wrong } })).status).toBe(400);
    }
    const fifth = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: wrong } });
    expect(fifth.status).toBe(429);
    expect((await fifth.json()).error.code).toBe("too_many_attempts");

    const after = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: right } });
    expect(after.status).toBe(400);
    expect((await after.json()).error.code).toBe("otp_expired");
  });

  it("rejects a code after 5 minutes", async () => {
    const { call, clock, lastCode } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    clock.advance(5 * MINUTE + 1_000);

    const res = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: lastCode() } });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("otp_expired");
  });

  it("accepts each code only once", async () => {
    const { call, lastCode } = await createTestApp();
    await call("POST", "/auth/otp/request", { body: { phone: "9876543210" } });
    const code = lastCode();
    expect((await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code } })).status).toBe(200);

    const again = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code } });
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("otp_expired");
  });

  it("rejects a code that was never requested", async () => {
    const { call } = await createTestApp();
    const res = await call("POST", "/auth/otp/verify", { body: { phone: "9876543210", code: "123456" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("otp_expired");
  });

  it.each([
    ["5 digits", { phone: "9876543210", code: "12345" }],
    ["letters", { phone: "9876543210", code: "12a456" }],
    ["no code", { phone: "9876543210" }],
  ])("rejects a malformed code (%s)", async (_label, body) => {
    const { call } = await createTestApp();
    const res = await call("POST", "/auth/otp/verify", { body });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("rejects an invalid phone number", async () => {
    const { call } = await createTestApp();
    const res = await call("POST", "/auth/otp/verify", { body: { phone: "12345", code: "123456" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_phone");
  });
});
