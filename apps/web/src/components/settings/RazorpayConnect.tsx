"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";
import { ApiRequestError, connectRazorpay, disconnectRazorpay, type RazorpayAccount } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

type Props = { token: string; account: RazorpayAccount | null; onChange: (account: RazorpayAccount | null) => void };

/**
 * The optional Razorpay part of Settings › Payments: the centre's OWN account,
 * so card and net-banking money settles to the centre. The API checks the keys
 * with Razorpay before keeping them (encrypted).
 */
export function RazorpayConnect({ token, account, onChange }: Props) {
  const t = copy.payments;
  const [editing, setEditing] = useState(false);
  const [keys, setKeys] = useState({ keyId: "", keySecret: "", webhookSecret: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      onChange((await connectRazorpay(token, { keyId: keys.keyId.trim(), keySecret: keys.keySecret, webhookSecret: keys.webhookSecret })).razorpay);
      setEditing(false);
      setKeys({ keyId: "", keySecret: "", webhookSecret: "" });
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectRazorpay(token);
      onChange(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: keyof typeof keys, label: string, hint?: string, type = "text") => ({
    label,
    type,
    value: keys[name],
    onChange: (event: { target: { value: string } }) => setKeys((k) => ({ ...k, [name]: event.target.value })),
    error: Boolean(fields[name]),
    helperText: fields[name] ?? hint,
    autoComplete: "off",
  });

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 3 } }}>
      {account ? (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography sx={{ fontWeight: 600 }}>{fill(t.connected, { keyId: account.keyId })}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {fill(t.webhookSteps, { url: account.webhookUrl })}
          </Typography>
          <Button color="overdue" onClick={disconnect} loading={busy}>
            {t.disconnect}
          </Button>
        </Stack>
      ) : editing ? (
        <Stack component="form" spacing={2} noValidate onSubmit={submit}>
          <TextField {...field("keyId", t.keyId, t.keysHint)} autoFocus />
          <TextField {...field("keySecret", t.keySecret, undefined, "password")} />
          <TextField {...field("webhookSecret", t.webhookSecret, t.webhookSecretHint, "password")} />
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" loading={busy}>
              {t.connectButton}
            </Button>
            <Button onClick={() => setEditing(false)}>{t.cancel}</Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="body2" color="text.secondary">
            {t.razorpay}
          </Typography>
          <Button variant="outlined" onClick={() => setEditing(true)}>
            {t.connect}
          </Button>
        </Stack>
      )}
      {account && error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
