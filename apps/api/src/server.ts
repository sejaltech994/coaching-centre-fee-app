import { createLocalDb, runMigrations } from "@chukta/db/local";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { googleFromConfig } from "./google";

const config = loadConfig();
const handle = createLocalDb(config.databaseUrl);
// The embedded database (local development) migrates itself; real servers are
// migrated by `npm run db:migrate` before a deploy.
if (handle.kind === "pglite") await runMigrations(handle);

const app = createApp({
  db: handle.db,
  google: googleFromConfig(config.google),
  now: () => new Date(),
  config,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.info(`API listening on http://localhost:${info.port}/api/v1 (${config.env}, ${handle.kind})`);
});
