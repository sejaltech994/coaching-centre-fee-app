import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const valid = {
  DATABASE_URL: "postgres://localhost/chukta",
  JWT_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  it("reads the environment with safe defaults", () => {
    expect(loadConfig(valid)).toEqual({
      env: "development",
      port: 8787,
      databaseUrl: "postgres://localhost/chukta",
      jwtSecret: "x".repeat(32),
      webOrigins: ["http://localhost:3000"],
      cookieSecure: false,
      trustProxyHeaders: false,
      google: null,
      razorpay: "razorpay",
      whatsapp: null,
    });
  });

  it("reads every setting", () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: "test",
      PORT: "9000",
      WEB_ORIGINS: "https://a.example, https://b.example",
      TRUST_PROXY_HEADERS: "true",
    });
    expect(config).toMatchObject({
      env: "test",
      port: 9000,
      webOrigins: ["https://a.example", "https://b.example"],
      cookieSecure: true,
      trustProxyHeaders: true,
    });
  });

  it.each([
    ["DATABASE_URL", { JWT_SECRET: "x".repeat(32) }],
    ["JWT_SECRET", { DATABASE_URL: "postgres://localhost/chukta" }],
  ])("refuses to start without %s", (name, env) => {
    expect(() => loadConfig(env)).toThrow(name);
  });

  it("refuses a short JWT secret", () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: "short" })).toThrow("JWT_SECRET");
  });

  it("runs hosted dev, sit and uat as staging, with secure cookies", () => {
    const config = loadConfig({ ...valid, NODE_ENV: "staging", TRUST_PROXY_HEADERS: "true" });
    expect(config).toMatchObject({ env: "staging", cookieSecure: true, trustProxyHeaders: true });
  });

  it("needs no SMS or code settings, even in production: owners don't confirm their number", () => {
    const config = loadConfig({ ...valid, NODE_ENV: "production", SMS_PROVIDER: "pigeon", OTP_PER_IP_PER_HOUR: "1000" });
    expect(config.env).toBe("production");
    expect(config).not.toHaveProperty("smsProvider");
    expect(config).not.toHaveProperty("otpLimits");
  });

  describe("Google sign-in", () => {
    it("is off unless configured", () => {
      expect(loadConfig(valid).google).toBeNull();
    });

    it("uses Google with the environment's OAuth client", () => {
      expect(loadConfig({ ...valid, GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "s" }).google).toEqual({
        provider: "google",
        clientId: "id.apps.googleusercontent.com",
        clientSecret: "s",
      });
    });

    it("needs both the client ID and the secret", () => {
      expect(() => loadConfig({ ...valid, GOOGLE_CLIENT_ID: "id" })).toThrow("GOOGLE_CLIENT_SECRET");
      expect(() => loadConfig({ ...valid, GOOGLE_CLIENT_SECRET: "s" })).toThrow("GOOGLE_CLIENT_ID");
    });

    it("offers the fake account chooser outside production, for local runs and automated tests", () => {
      expect(loadConfig({ ...valid, GOOGLE_PROVIDER: "fake" }).google).toEqual({ provider: "fake" });
      expect(loadConfig({ ...valid, NODE_ENV: "staging", GOOGLE_PROVIDER: "fake" }).google).toEqual({ provider: "fake" });
    });

    it("never fakes Google in production", () => {
      expect(() =>
        loadConfig({ ...valid, NODE_ENV: "production", GOOGLE_PROVIDER: "fake" }),
      ).toThrow("GOOGLE_PROVIDER=fake");
    });

    it("refuses an unknown provider", () => {
      expect(() => loadConfig({ ...valid, GOOGLE_PROVIDER: "yahoo" })).toThrow("GOOGLE_PROVIDER");
    });
  });

  describe("Razorpay", () => {
    it("calls the real Razorpay, with each centre's own keys, unless told to fake it", () => {
      expect(loadConfig(valid).razorpay).toBe("razorpay");
      expect(loadConfig({ ...valid, RAZORPAY_PROVIDER: "fake" }).razorpay).toBe("fake");
    });

    it("never fakes payments in production, and refuses unknown providers", () => {
      expect(() => loadConfig({ ...valid, NODE_ENV: "production", RAZORPAY_PROVIDER: "fake" })).toThrow("RAZORPAY_PROVIDER=fake");
      expect(() => loadConfig({ ...valid, RAZORPAY_PROVIDER: "paypal" })).toThrow("RAZORPAY_PROVIDER");
    });
  });

  describe("WhatsApp", () => {
    const META = {
      WHATSAPP_TOKEN: "token",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_APP_SECRET: "app-secret",
      WHATSAPP_VERIFY_TOKEN: "verify-me",
    };

    it("is off until configured: reminders are then recorded as skipped", () => {
      expect(loadConfig(valid).whatsapp).toBeNull();
      expect(loadConfig({ ...valid, NODE_ENV: "production" }).whatsapp).toBeNull();
    });

    it("sends through Meta's Cloud API with Chukta's number", () => {
      expect(loadConfig({ ...valid, ...META }).whatsapp).toEqual({
        provider: "meta",
        token: "token",
        phoneNumberId: "1234567890",
        appSecret: "app-secret",
        verifyToken: "verify-me",
      });
    });

    it("needs every Meta setting", () => {
      expect(() => loadConfig({ ...valid, ...META, WHATSAPP_APP_SECRET: undefined })).toThrow("WHATSAPP_APP_SECRET");
    });

    it("can fake sending outside production only", () => {
      expect(loadConfig({ ...valid, WHATSAPP_PROVIDER: "fake" }).whatsapp).toEqual({ provider: "fake" });
      expect(() => loadConfig({ ...valid, NODE_ENV: "production", WHATSAPP_PROVIDER: "fake" })).toThrow("WHATSAPP_PROVIDER=fake");
      expect(() => loadConfig({ ...valid, WHATSAPP_PROVIDER: "pigeon" })).toThrow("WHATSAPP_PROVIDER");
    });
  });
});
