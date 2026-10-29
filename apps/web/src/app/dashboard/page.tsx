"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/components/app/AppShell";
import app from "@/components/app/app.module.css";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Signed-in home: the month's fees at a glance (TSD: dashboard). */
export default function DashboardPage() {
  const { token, centre } = useSession();
  const t = copy.dashboard;

  return (
    <AppShell current="dashboard" centre={centre}>
      {centre ? (
        <Stack spacing={3}>
          <Stack spacing={0.75}>
            <Typography variant="h3" component="h1">
              {centre.name ?? t.welcome}
            </Typography>
            <Typography color="text.secondary">{centre.name ? t.lead : t.nameCentre}</Typography>
          </Stack>
          {token && <Dashboard token={token} />}
        </Stack>
      ) : (
        <p className={app.muted} aria-live="polite">
          Loading…
        </p>
      )}
    </AppShell>
  );
}
