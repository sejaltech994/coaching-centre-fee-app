"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { ReactNode } from "react";
import { theme } from "./theme";

/** MUI's styles in the page head, and the Chukta theme for everything inside. */
export function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "ck" }}>
      {/* Light until every screen is on the theme; then dark follows the system. */}
      <ThemeProvider theme={theme} defaultMode="light">
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
