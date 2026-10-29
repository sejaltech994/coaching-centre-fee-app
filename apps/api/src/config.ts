export type Config = {
  /** development = local; staging = hosted dev, sit and uat; production = prod. */
  env: "development" | "test" | "staging" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** Web app origins allowed to call the API with cookies (CORS). */
  webOrigins: string[];
  /** Secure cookies need HTTPS; off only for local http development. */
  cookieSecure: boolean;
  /** Read the client IP from cf-connecting-ip / x-forwarded-for. Only behind a trusted proxy. */
  trustProxyHeaders: boolean;
  /** Google sign-in: the environment's OAuth client, the fake chooser (never production), or off. */
  google: { provider: "google"; clientId: string; clientSecret: string } | { provider: "fake" } | null;
  /** Payments on each centre's own Razorpay account, or the fake checkout (never production). */
  razorpay: "razorpay" | "fake";
};

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

  const google = loadGoogle(env, nodeEnv);

  const razorpay = env.RAZORPAY_PROVIDER ?? "razorpay";
  if (razorpay !== "razorpay" && razorpay !== "fake") throw new Error(`RAZORPAY_PROVIDER "${razorpay}" is not supported`);
  if (razorpay === "fake" && nodeEnv === "production") {
    throw new Error("RAZORPAY_PROVIDER=fake marks bills paid without real money and is not allowed in production");
  }

  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 8787),
    databaseUrl: required("DATABASE_URL"),
    jwtSecret,
    webOrigins: (env.WEB_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSecure: nodeEnv !== "development",
    trustProxyHeaders: env.TRUST_PROXY_HEADERS === "true",
    google,
    razorpay,
  };
}

function loadGoogle(env: Record<string, string | undefined>, nodeEnv: Config["env"]): Config["google"] {
  const provider = env.GOOGLE_PROVIDER ?? (env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET ? "google" : undefined);
  if (provider === undefined) return null;
  if (provider === "fake") {
    if (nodeEnv === "production") {
      throw new Error("GOOGLE_PROVIDER=fake lets anyone sign in as any Google account and is not allowed in production");
    }
    return { provider: "fake" };
  }
  if (provider !== "google") throw new Error(`GOOGLE_PROVIDER "${provider}" is not supported`);
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return { provider: "google", clientId, clientSecret };
}
