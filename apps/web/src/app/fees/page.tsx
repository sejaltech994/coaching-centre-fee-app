"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/components/app/AppShell";
import { InvoiceList } from "@/components/fees/InvoiceList";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** Every bill at the centre, unpaid first. */
export default function FeesPage() {
  const { token, centre } = useSession();
  const t = copy.fees;

  return (
    <AppShell current="fees" centre={centre}>
      <Stack spacing={3}>
        <Stack spacing={0.75}>
          <Typography variant="h3" component="h1">
            {t.title}
          </Typography>
          <Typography color="text.secondary">{t.lead}</Typography>
        </Stack>
        {token && <InvoiceList token={token} />}
      </Stack>
    </AppShell>
  );
}
