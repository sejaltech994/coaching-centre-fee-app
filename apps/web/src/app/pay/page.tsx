"use client";

import { formatRupees, periodLabel } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Suspense, useEffect, useState } from "react";
import { apiBaseUrl, getPublicInvoice, startCheckout, type PublicInvoice } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { navigate } from "@/lib/navigate";

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const showDate = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

/** The UPI link as a QR code (an SVG image), for paying from another phone. */
function UpiQr({ link, label }: { link: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, width: 200 }).then(
      (svg) => setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
      () => setSrc(null),
    );
  }, [link]);
  return src ? <Box component="img" src={src} alt={label} sx={{ width: 200, height: 200 }} /> : null;
}

/** Cards, net banking and UPI on the centre's own Razorpay checkout. */
function CardButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      navigate((await startCheckout(token)).url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Button variant="outlined" size="large" onClick={go} loading={busy}>
        {copy.pay.payByCard}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function Bill({ data, token }: { data: PublicInvoice; token: string }) {
  const t = copy.pay;
  const { centre, invoice, upi } = data;
  const amount = formatRupees(invoice.totalPaise);
  const centreName = centre.name ?? "the centre";

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h3" component="h1">
          {centreName}
        </Typography>
        <Typography color="text.secondary">
          {fill(t.bill, {
            number: invoice.number,
            student: invoice.studentName,
            batch: invoice.batchName,
            period: periodLabel(invoice.cycle, invoice.periodStart),
          })}
        </Typography>
      </Stack>

      <Box>
        <Typography variant="h2" component="p">
          {amount}
        </Typography>
        {invoice.lateFeePaise > 0 && (
          <Typography variant="body2" color="text.secondary">
            {fill(t.lateFee, { amount: formatRupees(invoice.lateFeePaise) })}
          </Typography>
        )}
        {(invoice.status === "pending" || invoice.status === "overdue") && (
          <Typography color={invoice.status === "overdue" ? "overdue.main" : "text.secondary"} sx={{ fontWeight: 600 }}>
            {fill(invoice.status === "overdue" ? t.overdueSince : t.dueOn, { date: showDate(invoice.dueDate) })}
          </Typography>
        )}
      </Box>

      {invoice.status === "paid" && (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Alert severity="success">{t.paid}</Alert>
          <Link href={`${apiBaseUrl()}/public/receipts/${token}`}>{t.receipt}</Link>
        </Stack>
      )}
      {invoice.status === "waived" && <Alert severity="info">{t.waived}</Alert>}

      {upi ? (
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Button component="a" href={upi.link} variant="contained" size="large" color="accent">
            {fill(t.payWithUpi, { amount })}
          </Button>
          <UpiQr link={upi.link} label={fill(t.qrAlt, { amount })} />
          <Typography variant="body2" color="text.secondary">
            {fill(t.scan, { name: upi.payeeName, upiId: upi.upiId })}
          </Typography>
        </Stack>
      ) : (
        (invoice.status === "pending" || invoice.status === "overdue") &&
        !data.card && <Typography>{fill(t.noUpi, { centre: centreName })}</Typography>
      )}
      {data.card && <CardButton token={token} />}

      <Typography variant="caption" color="text.secondary">
        {t.footer}
      </Typography>
    </Stack>
  );
}

function PayScreen() {
  const token = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(token ? null : copy.pay.invalid);

  useEffect(() => {
    if (!token) return;
    getPublicInvoice(token).then(setData, (err: unknown) => setError(errorMessage(err)));
  }, [token]);

  if (error) return <Alert severity="error">{error}</Alert>;
  return data ? <Bill data={data} token={token} /> : null;
}

/** A parent's bill, opened from the link the centre sends: no sign-in. */
export default function PayPage() {
  return (
    <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
      <Card sx={{ p: { xs: 2.5, md: 4 } }}>
        {/* useSearchParams needs a Suspense boundary in a statically exported page. */}
        <Suspense fallback={null}>
          <PayScreen />
        </Suspense>
      </Card>
    </Container>
  );
}
