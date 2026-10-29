"use client";

import { validatePaymentSettings } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiRequestError, getPaymentSettings, savePaymentSettings, type PaymentSettings as Settings } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";

/**
 * Settings › Payments: the centre's own UPI ID. Each bill's pay link then opens
 * the parent's UPI app with the centre as payee; Chukta never holds the money.
 */
export function PaymentSettings({ token, onSaved }: { token: string; onSaved: () => void }) {
  const t = copy.payments;
  const titleId = useId();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ upiId: "", payeeName: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPaymentSettings(token).then(
      ({ paymentSettings }) => setSettings(paymentSettings),
      (err: unknown) => setError(errorMessage(err)),
    );
  }, [token]);

  function startEditing() {
    setDraft({ upiId: settings?.upiId ?? "", payeeName: settings?.payeeName ?? "" });
    setFields({});
    setError(null);
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validatePaymentSettings(draft);
    if (!checked.ok) return setFields(checked.fields);
    setBusy(true);
    setError(null);
    try {
      setSettings((await savePaymentSettings(token, checked.value)).paymentSettings);
      setEditing(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const text = (name: "upiId" | "payeeName", label: string, hint?: string) => ({
    label,
    value: draft[name],
    onChange: (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [name]: event.target.value })),
    error: Boolean(fields[name]),
    helperText: fields[name] ?? hint,
  });

  return (
    <Card component="section" aria-labelledby={titleId}>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 }, pb: 1 }}>
        <Typography id={titleId} variant="h4" component="h2">
          {t.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t.lead}
        </Typography>
      </Box>
      {editing ? (
        <Stack component="form" spacing={2} noValidate onSubmit={submit} sx={{ p: { xs: 2, md: 3 }, pt: 1 }}>
          <TextField {...text("upiId", t.upiId, t.upiIdHint)} autoFocus slotProps={{ htmlInput: { autoCapitalize: "none" } }} />
          <TextField {...text("payeeName", t.payeeName)} />
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" loading={busy}>
              {t.save}
            </Button>
            <Button onClick={() => setEditing(false)}>{t.cancel}</Button>
          </Stack>
        </Stack>
      ) : (
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, py: 2 }}
        >
          {settings?.upiId ? (
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{settings.upiId}</Typography>
              <Typography variant="body2" color="text.secondary">
                {fill(t.paidTo, { name: settings.payeeName ?? "" })}
              </Typography>
            </Box>
          ) : (
            <Typography color="text.secondary">{settings ? t.none : null}</Typography>
          )}
          {settings && <Button onClick={startEditing}>{settings.upiId ? t.change : t.add}</Button>}
        </Stack>
      )}
      {!editing && error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}
    </Card>
  );
}
