import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";

/**
 * The sign-in frame from the design: the indigo-deep panel with the promise on
 * one side, the form on paper on the other. Below 900 px the panel gives way to
 * a small brand line above the form.
 */
export function AuthShell({
  children,
  promise = copy.auth.promise,
  pitch = copy.auth.pitch,
}: {
  children: ReactNode;
  promise?: string;
  pitch?: string;
}) {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default", color: "text.primary" }}>
      <Box
        component="aside"
        sx={{
          flex: "0 0 42%",
          maxWidth: 600,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 6,
          px: 8,
          py: 7,
          bgcolor: "deep.main",
          color: "deep.contrastText",
        }}
      >
        <Brand size="lg" />
        <Stack spacing={2} sx={{ maxWidth: 440 }}>
          <Typography variant="h1" component="p">
            {promise}
          </Typography>
          <Typography variant="bodyLg" sx={{ opacity: 0.8 }}>
            {pitch}
          </Typography>
        </Stack>
        <Coins />
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: { xs: "flex-start", md: "center" },
          gap: 3,
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 6 },
        }}
      >
        <Box sx={{ display: { xs: "flex", md: "none" }, alignSelf: "stretch", color: "primary.main" }}>
          <Brand size="sm" />
        </Box>
        <Box sx={{ width: "100%", maxWidth: 440 }}>{children}</Box>
      </Box>
    </Box>
  );
}

function Brand({ size }: { size: "sm" | "lg" }) {
  const coin = size === "lg" ? 22 : 18;
  return (
    <Box
      component={Link}
      href="/"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1.25,
        color: "inherit",
        textDecoration: "none",
        fontFamily: "h1.fontFamily",
        fontWeight: 600,
        fontSize: size === "lg" ? 28 : 22,
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ width: coin, height: coin, borderRadius: "50%", bgcolor: "accent.main" }} />
      Chukta
      <Box component="span" lang="hi" sx={{ fontSize: "0.6em", opacity: 0.7 }}>
        चुकता
      </Box>
    </Box>
  );
}

function Coins() {
  const disc = { width: 48, height: 48, borderRadius: "50%", border: 4, borderColor: "deep.main" };
  return (
    <Box aria-hidden="true" sx={{ display: "flex" }}>
      <Box sx={{ ...disc, bgcolor: "accent.main" }} />
      <Box sx={{ ...disc, bgcolor: "deep.contrastText", ml: -2.25 }} />
      <Box sx={{ ...disc, bgcolor: "accent.light", ml: -2.25 }} />
    </Box>
  );
}
