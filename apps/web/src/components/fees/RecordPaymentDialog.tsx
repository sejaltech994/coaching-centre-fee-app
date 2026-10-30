"use client";

import { formatRupees, periodLabel } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useId, useState, type FormEvent } from "react";
import { ApiRequestError, recordPayment, type Invoice, type PaymentInput } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

type Props = { token: string; invoice: Invoice; onClose: () => void; onRecorded: (invoice: Invoice) => void };

// Dates are the centre's (India's), whatever the browser's timezone.
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Recording a bill paid in full: how, when, and any reference. The API issues the receipt. */
export function RecordPaymentDialog({ token, invoice, onClose, onRecorded }: Props) {
  const t = copy.fees;
  const titleId = useId();
  const methodId = useId();
  const today = todayInIndia();
  const [form, setForm] = useState<PaymentInput>({ method: "cash", reference: "", receivedOn: today });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRecorded((await recordPayment(token, invoice.id, { ...form, reference: form.reference.trim() })).invoice);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <form noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{fill(t.paymentTitle, { number: invoice.number })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25}>
            <DialogContentText>
              {fill(t.paymentLead, {
                student: invoice.student.name,
                amount: formatRupees(invoice.totalPaise),
                period: periodLabel(invoice.cycle, invoice.periodStart),
              })}
            </DialogContentText>
            <Stack spacing={1}>
              <Typography id={methodId} variant="body2" sx={{ fontWeight: 600 }}>
                {t.paidBy}
              </Typography>
              <ToggleButtonGroup
                exclusive
                aria-labelledby={methodId}
                value={form.method}
                onChange={(_event, method: PaymentInput["method"] | null) => method && setForm((f) => ({ ...f, method }))}
              >
                <ToggleButton value="cash">{t.cash}</ToggleButton>
                <ToggleButton value="upi">{t.upi}</ToggleButton>
                <ToggleButton value="bank_transfer">{t.bankTransfer}</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <TextField
              label={t.reference}
              value={form.reference}
              onChange={(event) => setForm((f) => ({ ...f, reference: event.target.value }))}
              error={Boolean(fields.reference)}
              helperText={fields.reference ?? t.referenceHint}
            />
            <TextField
              type="date"
              label={t.receivedOn}
              value={form.receivedOn}
              onChange={(event) => setForm((f) => ({ ...f, receivedOn: event.target.value }))}
              error={Boolean(fields.receivedOn)}
              helperText={fields.receivedOn}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button type="submit" variant="contained" color="paid" loading={busy}>
            {t.recordPayment}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
