"use client";

import { formatIndianMobile, INVALID_PHONE_MESSAGE, normalizeIndianMobile } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, confirmPhone, sendPhoneCode, type Me } from "@/lib/api";
import { copy, errorMessage, fill } from "@/lib/copy";
import { OtpInput } from "./OtpInput";

type Props = {
  token: string;
  /** The owner's number now, E.164: offered first. */
  phone: string;
  onConfirmed: (user: Me["user"]) => void;
  onCancel: () => void;
};

/** "98765 43210" from "+919876543210": the field shows the number without +91. */
const national = (e164: string) => formatIndianMobile(e164).replace(/^\+91 /, "");

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Confirming the mobile number: the number (the owner's, or a new one), then the
 * 6-digit code texted to it. On success it is the owner's confirmed number.
 */
export function PhoneConfirm({ token, phone, onConfirmed, onCancel }: Props) {
  const t = copy.settings;
  const [step, setStep] = useState<"number" | "code">("number");
  const [number, setNumber] = useState(national(phone));
  const [numberError, setNumberError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [wrongCode, setWrongCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When a new code may be sent. The countdown reads the clock on each tick, so a
  // throttled background tab still shows the right time when it comes back.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  async function send() {
    const normalized = normalizeIndianMobile(number);
    if (!normalized) return setNumberError(INVALID_PHONE_MESSAGE);
    setNumberError(null);
    setError(null);
    setBusy(true);
    try {
      const { resendAfterSeconds } = await sendPhoneCode(token, number);
      setStep("code");
      setCode("");
      setWrongCode(false);
      setNow(Date.now());
      setResendAt(Date.now() + resendAfterSeconds * 1000);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields?.phone) setNumberError(err.fields.phone);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (code.length < 6) return setError(t.codeIncomplete);
    setError(null);
    setBusy(true);
    try {
      onConfirmed((await confirmPhone(token, number, code)).user);
    } catch (err) {
      setError(errorMessage(err));
      setWrongCode(err instanceof ApiRequestError && err.code === "invalid_otp");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const sendForm = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  if (step === "number") {
    return (
      <Stack component="form" spacing={2} noValidate onSubmit={sendForm} sx={{ p: { xs: 2, md: 3 }, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t.phoneLead}
        </Typography>
        <TextField
          label={copy.profile.phone}
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          error={Boolean(numberError)}
          helperText={numberError}
          type="tel"
          autoComplete="tel-national"
          autoFocus
          slotProps={{
            htmlInput: { inputMode: "numeric" },
            input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
          }}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" loading={busy}>
            {t.sendCode}
          </Button>
          <Button onClick={onCancel}>{t.cancel}</Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={confirm} sx={{ p: { xs: 2, md: 3 }, pt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {fill(t.codeSentTo, { phone: formatIndianMobile(normalizeIndianMobile(number) ?? phone) })}
      </Typography>
      <OtpInput value={code} onChange={setCode} invalid={wrongCode} disabled={busy} autoFocus />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button type="submit" variant="contained" loading={busy}>
          {t.confirmCode}
        </Button>
        <Button disabled={resendIn > 0 || busy} onClick={() => void send()}>
          {resendIn > 0 ? fill(t.resendIn, { time: clock(resendIn) }) : t.resend}
        </Button>
        <Button
          onClick={() => {
            setStep("number");
            setError(null);
          }}
        >
          {t.differentNumber}
        </Button>
        <Button onClick={onCancel}>{t.cancel}</Button>
      </Stack>
    </Stack>
  );
}
