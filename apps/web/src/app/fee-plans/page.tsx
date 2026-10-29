"use client";

import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { FeePlans } from "@/components/fee-plans/FeePlans";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/useSession";

/** The centre's fee plans, reached from Batches (each batch bills its students on one). */
export default function FeePlansPage() {
  const { token, centre } = useSession();
  const t = copy.feePlans;

  return (
    <AppShell current="batches" centre={centre}>
      <Stack spacing={3} sx={{ maxWidth: 820 }}>
        <Stack spacing={0.75}>
          <Link component={NextLink} href="/batches" variant="body2" sx={{ fontWeight: 600 }}>
            {t.back}
          </Link>
          <Typography variant="h3" component="h1">
            {t.title}
          </Typography>
          <Typography color="text.secondary">{t.lead}</Typography>
        </Stack>
        {token && <FeePlans token={token} />}
      </Stack>
    </AppShell>
  );
}
