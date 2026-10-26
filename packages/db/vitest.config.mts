import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Each test boots an in-memory Postgres and runs the migrations: ~1 s locally,
    // 2–3 s on CI runners, and some tests boot two. Real hangs still fail.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // migrate.ts is a CLI entry point run by hand against a real database.
      exclude: ["src/**/*.test.ts", "src/migrate.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
