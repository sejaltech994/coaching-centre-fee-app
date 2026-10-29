"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useState } from "react";
import { previewReminder, sendReminders, type Invoice } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

type Props = {
  token: string;
  invoices: Invoice[];
  onClose: () => void;
  onSent: (summary: { sent: number; skipped: number }) => void;
};

/**
 * Sending WhatsApp reminders by hand: first the exact message (the first bill's,
 * with its real names and amount), then Send. Each parent gets their own bill.
 */
export function RemindDialog({ token, invoices, onClose, onSent }: Props) {
  const t = copy.fees;
  const titleId = useId();
  const many = invoices.length > 1;
  const [preview, setPreview] = useState<{ text: string; canSend: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previewReminder(token, invoices[0]!.id).then(setPreview, (err: unknown) => setError(errorMessage(err)));
  }, [token, invoices]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { results } = await sendReminders(token, invoices.map((invoice) => invoice.id));
      const sent = results.filter((r) => r.status === "sent").length;
      onSent({ sent, skipped: results.length - sent });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // With several bills, a parent who can't be messaged is skipped; with one, it can't be sent.
  const canSend = preview && (many || preview.canSend);
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{many ? fill(t.remindAllTitle, { count: invoices.length }) : t.remindTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {many && <Typography color="text.secondary">{t.remindAllLead}</Typography>}
          {preview && (
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              <Typography>{preview.text}</Typography>
            </Box>
          )}
          {preview && !preview.canSend && !many && <Alert severity="info">{preview.reason}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.cancel}</Button>
        {canSend && (
          <Button variant="contained" onClick={send} loading={busy}>
            {t.send}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
