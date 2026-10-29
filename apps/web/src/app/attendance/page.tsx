"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/components/app/AppShell";
import { Attendance } from "@/components/attendance/Attendance";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Daily attendance per batch. */
export default function AttendancePage() {
  const { token, centre } = useSession();
  const t = copy.attendance;
  return (
    <AppShell current="attendance" centre={centre}>
      <Stack spacing={3}>
        <Stack spacing={0.75}>
          <Typography variant="h3" component="h1">
            {t.title}
          </Typography>
          <Typography color="text.secondary">{t.lead}</Typography>
        </Stack>
        {token && <Attendance token={token} />}
      </Stack>
    </AppShell>
  );
}
