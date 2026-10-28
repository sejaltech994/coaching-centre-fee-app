"use client";

import { CENTRE_TYPES, validateProfile, type CentreType } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, getGooglePending, registerOwner, type GooglePending, type LoginSession } from "@/lib/api";
import { copy, errorMessage, fill, withParts } from "@/lib/copy";

type Props = {
  onSignedUp: (session: LoginSession) => void;
  /** No Google sign-in is waiting (never started, or older than 15 minutes). */
  onExpired: () => void;
};

type Field = "fullName" | "phone" | "centreName" | "city" | "centreType";
const FIELD_ORDER: Field[] = ["fullName", "phone", "centreName", "city", "centreType"];

const TYPE_LABEL: Record<CentreType, keyof typeof copy.profile> = {
  tuition: "typeTuition",
  coaching: "typeCoaching",
  dance: "typeDance",
  music: "typeMusic",
  sports: "typeSports",
  other: "typeOther",
};

const isExpired = (err: unknown) => err instanceof ApiRequestError && err.code === "google_pending_missing";

/**
 * Sign-up after Google (W3, with W2's name and mobile number): the Google account
 * is signed in but has no Chukta account yet. Its email is Google's.
 */
export function SignUpForm({ onSignedUp, onExpired }: Props) {
  const t = copy.profile;
  const [google, setGoogle] = useState<GooglePending | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", centreName: "", city: "", centreType: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGooglePending().then(
      (pending) => {
        setGoogle(pending);
        setForm((current) => ({ ...current, fullName: pending.name ?? "" }));
      },
      (err: unknown) => (isExpired(err) ? onExpired() : setError(errorMessage(err))),
    );
  }, [onExpired]);

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  function showErrors(fields: Record<string, string>) {
    setFieldErrors(fields);
    // Terms has no field to point at, so it gets the alert above the button.
    setError(fields.acceptedTerms ?? null);
    const first = FIELD_ORDER.find((field) => fields[field]);
    if (first) document.getElementById(`signup-${first}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { ...form, acceptedTerms };
    const checked = validateProfile(input);
    if (!checked.ok) return showErrors(checked.fields);

    setBusy(true);
    setError(null);
    try {
      onSignedUp(await registerOwner(input));
    } catch (err) {
      if (isExpired(err)) return onExpired();
      if (err instanceof ApiRequestError && err.fields) showErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!google) return error ? <Alert severity="error">{error}</Alert> : null;

  const field = (name: Exclude<Field, "centreType">, label: string) => ({
    id: `signup-${name}`,
    label,
    value: form[name],
    onChange: set(name),
    error: Boolean(fieldErrors[name]),
    helperText: fieldErrors[name],
  });

  return (
    <Stack component="form" spacing={2.25} noValidate onSubmit={submit}>
      <Stack spacing={0.75}>
        <Typography variant="h3" component="h1">
          {t.title}
        </Typography>
        <Typography color="text.secondary">{fill(t.lead, { email: google.email })}</Typography>
      </Stack>

      <TextField {...field("fullName", t.fullName)} autoComplete="name" />
      <TextField
        {...field("phone", t.phone)}
        type="tel"
        autoComplete="tel-national"
        helperText={fieldErrors.phone ?? t.phoneHint}
        slotProps={{
          htmlInput: { inputMode: "numeric" },
          input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
        }}
      />
      <TextField {...field("centreName", t.centreName)} />
      <TextField {...field("city", t.city)} autoComplete="address-level2" />

      <Stack spacing={1}>
        <Typography id="signup-centreType-label" variant="body2" sx={{ fontWeight: 600 }}>
          {t.centreType}
        </Typography>
        <ToggleButtonGroup
          id="signup-centreType"
          exclusive
          aria-labelledby="signup-centreType-label"
          value={form.centreType || null}
          onChange={(_event, value: CentreType | null) => value && setForm((current) => ({ ...current, centreType: value }))}
          sx={{ flexWrap: "wrap", gap: 1 }}
        >
          {CENTRE_TYPES.map((type) => (
            <ToggleButton key={type} value={type}>
              {t[TYPE_LABEL[type]]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {fieldErrors.centreType && <FormHelperText error>{fieldErrors.centreType}</FormHelperText>}
      </Stack>

      <FormControlLabel
        control={<Checkbox checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />}
        label={withParts(t.terms, {
          terms: (
            <Link component={NextLink} href="/terms">
              {copy.auth.termsLink}
            </Link>
          ),
          privacy: (
            <Link component={NextLink} href="/privacy">
              {copy.auth.privacyLink}
            </Link>
          ),
        })}
        sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { pt: 0 } }}
        slotProps={{ typography: { variant: "body2" } }}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Button type="submit" variant="contained" size="large" fullWidth loading={busy} sx={{ minHeight: 52 }}>
        {t.submit}
      </Button>
    </Stack>
  );
}
