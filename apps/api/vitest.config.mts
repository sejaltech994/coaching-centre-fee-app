import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Each test boots an in-memory Postgres and runs the migrations: ~1 s locally,
    // 2–3 s on CI runners, and some tests boot two. Real hangs still fail.
    testTimeout: 20_000,
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
