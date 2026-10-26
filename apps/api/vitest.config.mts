import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**",
        // Entry point: wires real env, Postgres and the HTTP server together.
        "src/server.ts",
      ],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
