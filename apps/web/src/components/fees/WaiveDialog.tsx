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
import { useId, useState, type FormEvent } from "react";
import { ApiRequestError, waiveInvoice, type Invoice } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

type Props = { token: string; invoice: Invoice; onClose: () => void; onWaived: (invoice: Invoice) => void };

/** Waiving a bill: the owner says why, and the bill is no longer asked for. */
export function WaiveDialog({ token, invoice, onClose, onWaived }: Props) {
  const t = copy.fees;
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return setFieldError(t.reasonMissing);
    setBusy(true);
    setError(null);
    try {
      onWaived((await waiveInvoice(token, invoice.id, reason.trim())).invoice);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields?.reason) setFieldError(err.fields.reason);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <form noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{fill(t.waiveTitle, { number: invoice.number })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {fill(t.waiveLead, {
                student: invoice.student.name,
                amount: formatRupees(invoice.totalPaise),
                period: periodLabel(invoice.cycle, invoice.periodStart),
              })}
            </DialogContentText>
            <TextField
              label={t.reason}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={Boolean(fieldError)}
              helperText={fieldError ?? t.reasonHint}
              autoFocus
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t.cancel}</Button>
          <Button type="submit" variant="contained" color="overdue" loading={busy}>
            {t.confirmWaive}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
