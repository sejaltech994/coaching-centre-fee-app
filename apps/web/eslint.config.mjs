import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// #RGB to #RRGGBBAA, or rgb()/rgba()/hsl()/hsla().
const COLOUR = String.raw`/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/`;
const COLOUR_MESSAGE =
  'Use a theme colour by name (color="primary", sx={{ color: "text.secondary" }}); colour values live only in src/theme.';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Colours come from the theme by name (TSD: UI components and theming).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/theme/**",
      // Google's sign-in guidelines require its "G" in Google's own colours.
      "src/components/auth/GoogleMark.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${COLOUR}]`, message: COLOUR_MESSAGE },
        { selector: `TemplateElement[value.raw=${COLOUR}]`, message: COLOUR_MESSAGE },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", ".wrangler/**", "next-env.d.ts"]),
]);
