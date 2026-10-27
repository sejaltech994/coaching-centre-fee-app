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
      smsProvider: "console",
      webOrigins: ["http://localhost:3000"],
      cookieSecure: false,
      trustProxyHeaders: false,
      otpLimits: { perPhonePerHour: 5, perIpPerHour: 10 },
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

  it("refuses to print login codes to the console in production", () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: "production", WEB_ORIGINS: "https://app.example" })).toThrow(
      "SMS_PROVIDER",
    );
  });

  it("runs hosted dev, sit and uat as staging: secure cookies, console SMS still allowed", () => {
    const config = loadConfig({ ...valid, NODE_ENV: "staging", TRUST_PROXY_HEADERS: "true" });
    expect(config).toMatchObject({ env: "staging", cookieSecure: true, smsProvider: "console", trustProxyHeaders: true });
  });

  it("keeps the TSD's OTP limits by default", () => {
    expect(loadConfig(valid).otpLimits).toEqual({ perPhonePerHour: 5, perIpPerHour: 10 });
  });

  it("lets development and test raise the OTP limits, for automated test runs", () => {
    const config = loadConfig({ ...valid, NODE_ENV: "test", OTP_PER_IP_PER_HOUR: "1000", OTP_PER_PHONE_PER_HOUR: "50" });
    expect(config.otpLimits).toEqual({ perPhonePerHour: 50, perIpPerHour: 1000 });
  });

  it("never lets production change the OTP limits", () => {
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: "production", SMS_PROVIDER: "console", OTP_PER_IP_PER_HOUR: "1000" }),
    ).toThrow("OTP_PER_IP_PER_HOUR");
  });

  it("refuses a limit that isn't a positive whole number", () => {
    expect(() => loadConfig({ ...valid, OTP_PER_IP_PER_HOUR: "lots" })).toThrow("OTP_PER_IP_PER_HOUR");
  });

  it("refuses an unknown SMS provider", () => {
    expect(() => loadConfig({ ...valid, SMS_PROVIDER: "pigeon" })).toThrow("SMS_PROVIDER");
  });
});
