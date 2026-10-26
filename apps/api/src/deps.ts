import type { Database } from "@chukta/db";
import type { SmsProvider } from "@chukta/integrations";
import type { Config } from "./config";

/** Everything the API needs from the outside world, injected so tests can control it. */
export type Deps = {
  db: Database;
  sms: SmsProvider;
  now: () => Date;
  config: Config;
};

/** Who is calling, taken from a verified access token. centreId scopes every query. */
export type AuthContext = { userId: string; centreId: string; role: "owner" };

export type AppEnv = { Variables: { auth: AuthContext } };
