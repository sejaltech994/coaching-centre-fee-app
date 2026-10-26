// Lint rules for the API and shared packages. apps/web has its own config
// (eslint-config-next), which ESLint picks up when run inside apps/web.
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/coverage/**", "**/dist/**", "apps/web/**", "packages/db/migrations/**"]),
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]);
