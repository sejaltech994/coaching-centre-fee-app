export type Config = {
  /** development = local; staging = hosted dev, sit and uat; production = prod. */
  env: "development" | "test" | "staging" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  smsProvider: "console";
  /** Web app origins allowed to call the API with cookies (CORS). */
  webOrigins: string[];
  /** Secure cookies need HTTPS; off only for local http development. */
  cookieSecure: boolean;
  /** Read the client IP from cf-connecting-ip / x-forwarded-for. Only behind a trusted proxy. */
  trustProxyHeaders: boolean;
  /** Hourly OTP limits. The TSD's values; only non-production may raise them (automated test runs). */
  otpLimits: { perPhonePerHour: number; perIpPerHour: number };
};

const SMS_PROVIDERS = ["console"] as const;
const ENVS = ["development", "test", "staging", "production"] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };

  const nodeEnv = ENVS.find((name) => name === env.NODE_ENV) ?? "development";
  const jwtSecret = required("JWT_SECRET");
  if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

  const limit = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (nodeEnv === "production") throw new Error(`${name} can't be changed in production`);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive whole number`);
    return value;
  };

  // Checked first, so changing a limit in production always fails loudly.
  const otpLimits = {
    perPhonePerHour: limit("OTP_PER_PHONE_PER_HOUR", 5),
    perIpPerHour: limit("OTP_PER_IP_PER_HOUR", 10),
  };

  const smsProvider = env.SMS_PROVIDER ?? "console";
  if (!SMS_PROVIDERS.includes(smsProvider as (typeof SMS_PROVIDERS)[number])) {
    throw new Error(`SMS_PROVIDER "${smsProvider}" is not supported`);
  }
  if (nodeEnv === "production" && smsProvider === "console") {
    throw new Error("SMS_PROVIDER=console prints login codes to the log and is not allowed in production");
  }

  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 8787),
    databaseUrl: required("DATABASE_URL"),
    jwtSecret,
    smsProvider: smsProvider as Config["smsProvider"],
    webOrigins: (env.WEB_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSecure: nodeEnv !== "development",
    trustProxyHeaders: env.TRUST_PROXY_HEADERS === "true",
    otpLimits,
  };
}
