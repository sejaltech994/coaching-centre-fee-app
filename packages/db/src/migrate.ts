// Applies pending migrations: `DATABASE_URL=... npm run db:migrate -w packages/db`.
import { createDb, runMigrations } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const handle = createDb(url);
try {
  await runMigrations(handle);
  console.info("Migrations applied");
} finally {
  await handle.close();
}
