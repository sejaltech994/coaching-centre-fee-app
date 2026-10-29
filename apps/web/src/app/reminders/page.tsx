"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/components/app/AppShell";
import { Reminders } from "@/components/reminders/Reminders";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** WhatsApp reminders: the schedule, the tone, and what was sent. */
export default function RemindersPage() {
  const { token, centre } = useSession();
  const t = copy.reminders;
  return (
    <AppShell current="reminders" centre={centre}>
      <Stack spacing={3}>
        <Stack spacing={0.75}>
          <Typography variant="h3" component="h1">
            {t.title}
          </Typography>
          <Typography color="text.secondary">{t.lead}</Typography>
        </Stack>
        {token && <Reminders token={token} />}
      </Stack>
    </AppShell>
  );
}
