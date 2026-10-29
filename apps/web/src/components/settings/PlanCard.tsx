"use client";

import { formatRupees } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";
import { cancelPro, startPro, type Subscription } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { navigate } from "@/lib/navigate";

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Props = { token: string; subscription: Subscription; onChange: (subscription: Subscription) => void };

/** Settings › Plan: Free or Pro, what's used, and going Pro (Razorpay checkout on Chukta's own account) or cancelling. */
export function PlanCard({ token, subscription, onChange }: Props) {
  const t = copy.plan;
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pro = subscription.plan === "pro";
  const until = subscription.renewsAt ? dayFormat.format(new Date(subscription.renewsAt)) : "";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const goPro = () => run(async () => navigate((await startPro(token)).url));
  const cancel = () => run(async () => onChange({ ...subscription, ...(await cancelPro(token)) }));

  return (
    <Card component="section" aria-labelledby={titleId} sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography id={titleId} variant="h4" component="h2">
            {t.title}
          </Typography>
          <Chip label={pro ? t.pro : t.free} color={pro ? "primary" : "default"} />
        </Stack>
        <Typography sx={{ fontWeight: 600 }}>
          {subscription.students.max === null
            ? fill(t.count, { active: subscription.students.active })
            : fill(t.usage, { active: subscription.students.active, max: subscription.students.max })}
        </Typography>
        {pro ? (
          <Typography color="text.secondary">
            {subscription.status === "cancelled" || subscription.status === "halted" ? fill(t.ends, { date: until }) : fill(t.renews, { date: until })}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t.freeIncludes} {t.proIncludes}
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          {!pro && subscription.canUpgrade && (
            <Button variant="contained" color="accent" onClick={goPro} loading={busy}>
              {fill(t.goPro, { price: formatRupees(subscription.proPricePaise) })}
            </Button>
          )}
          {!pro && !subscription.canUpgrade && <Typography color="text.secondary">{t.unavailable}</Typography>}
          {pro && subscription.status === "active" && (
            <Button color="overdue" onClick={cancel} loading={busy}>
              {t.cancel}
            </Button>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
