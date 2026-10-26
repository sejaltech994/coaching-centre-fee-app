import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
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
