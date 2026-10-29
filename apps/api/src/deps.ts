import type { Database } from "@chukta/db";
import type { GoogleSignIn } from "@chukta/integrations";
import type { Config } from "./config";

/** Everything the API needs from the outside world, injected so tests can control it. */
export type Deps = {
  db: Database;
  /** Google sign-in, or null when it isn't configured for this environment. */
  google: GoogleSignIn | null;
  now: () => Date;
  config: Config;
};

/** Who is calling, taken from a verified access token. centreId scopes every query. */
export type AuthContext = {
  userId: string;
  centreId: string;
  role: "owner";
  /** The sign-in (refresh token family) this token belongs to: which device is calling. */
  sessionId?: string;
};

export type AppEnv = { Variables: { auth: AuthContext } };
