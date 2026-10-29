// Cloudflare Workers entry point (hosted dev, sit, uat, prod). One Worker per
// environment serves both the static website and the API at /api/*, so the
// refresh cookie stays first-party (SameSite=Strict) and no CORS is needed.
// Local development runs src/server.ts on Node instead.
import { createDb, type DbHandle } from "@chukta/db";
import { createApp } from "./app";
import { loadConfig, type Config } from "./config";
import { googleFromConfig } from "./google";
import { runScheduledJobs } from "./jobs";

/** The Worker's bindings: vars and secrets from wrangler.jsonc, plus the static assets. */
export type WorkerEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  [name: string]: unknown;
};

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

const misconfigured = () =>
  Response.json({ error: { code: "misconfigured", message: "The service is not configured." } }, { status: 503 });

function stringVars(env: WorkerEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === "string")) as Record<string, string>;
}

/** The API's settings from the Worker's bindings, or null (logged) when they're incomplete. */
function configFrom(env: WorkerEnv): Config | null {
  // Hyperdrive keeps warm, pooled connections close to the database, saving the
  // TCP + TLS + login round trips a fresh connection costs on every request.
  const vars = stringVars(env);
  const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined;
  if (hyperdrive?.connectionString) vars.DATABASE_URL = hyperdrive.connectionString;
  try {
    return loadConfig(vars);
  } catch (err) {
    // Names the missing setting for whoever reads the log; the response stays generic.
    console.error("API misconfigured:", (err as Error).message);
    return null;
  }
}

/**
 * `makeDb` opens the database for one request. Workers can't keep connections
 * between requests, so each request gets a one-connection pool, closed after the
 * response is sent.
 */
export function createWorker(makeDb: (url: string) => DbHandle = (url) => createDb(url, { max: 1 })) {
  return {
    async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
      if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

      const config = configFrom(env);
      if (!config) return misconfigured();

      const handle = makeDb(config.databaseUrl);
      try {
        const app = createApp({
          db: handle.db,
          google: googleFromConfig(config.google),
          now: () => new Date(),
          config,
        });
        return await app.fetch(request, env, ctx as never);
      } finally {
        ctx.waitUntil(handle.close());
      }
    },

    /** The hourly Cron Trigger (wrangler.jsonc): bills, overdue marks and the other scheduled jobs. */
    async scheduled(_event: { cron: string; scheduledTime: number }, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
      const config = configFrom(env);
      if (!config) return;
      const handle = makeDb(config.databaseUrl);
      try {
        await runScheduledJobs({ db: handle.db, google: null, now: () => new Date(), config });
      } finally {
        ctx.waitUntil(handle.close());
      }
    },
  };
}

export default createWorker();
