import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes a new SQL migration after a schema.ts change;
// `npm run db:studio` opens a browser GUI on DATABASE_URL: a postgres:// URL,
// or pglite:<folder> for the embedded local database (stop the API first:
// only one process may open a PGlite folder at a time).
const url = process.env.DATABASE_URL ?? "pglite:../../.data/dev";

export default url.startsWith("pglite:")
  ? defineConfig({
      dialect: "postgresql",
      driver: "pglite",
      schema: "./src/schema.ts",
      out: "./migrations",
      dbCredentials: { url: url.slice("pglite:".length) },
      strict: true,
    })
  : defineConfig({
      dialect: "postgresql",
      schema: "./src/schema.ts",
      out: "./migrations",
      dbCredentials: { url },
      strict: true,
    });
