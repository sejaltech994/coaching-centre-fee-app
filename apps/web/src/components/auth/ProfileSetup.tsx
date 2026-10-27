"use client";

import { CENTRE_TYPE_LABELS, CENTRE_TYPES, formatIndianMobile, validateProfile } from "@chukta/shared";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, registerOwner, type LoginSession } from "@/lib/api";
import styles from "./auth.module.css";

type Props = {
  signupTicket: string;
  /** The verified number, E.164. */
  phone: string;
  onRegistered: (session: LoginSession) => void;
  /** The ticket expired: go back to the mobile number step. */
  onStartOver: () => void;
};

type Field = "fullName" | "centreName" | "city" | "centreType" | "email";
const FIELD_ORDER: Field[] = ["fullName", "centreName", "city", "centreType", "email"];

/** Profile setup (A5): only for numbers with no account. TSD: Registration, login and profile. */
export function ProfileSetup({ signupTicket, phone, onRegistered, onStartOver }: Props) {
  const [form, setForm] = useState({ fullName: "", centreName: "", city: "", centreType: "", email: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  function showErrors(fields: Record<string, string>) {
    setFieldErrors(fields);
    // Terms has no input to point at, so it gets the alert above the button.
    setError(fields.acceptedTerms ?? null);
    const first = FIELD_ORDER.find((field) => fields[field]);
    if (first) document.getElementById(`profile-${first}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateProfile({ ...form, acceptedTerms });
    if (!checked.ok) {
      showErrors(checked.fields);
      return;
    }
    setBusy(true);
    setFieldErrors({});
    setError(null);
    try {
      const { email, ...profile } = checked.value;
      onRegistered(
        await registerOwner({ signupTicket, ...profile, ...(email && { email }), acceptedTerms: true }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) {
        showErrors(err.fields);
      } else {
        setExpired(err instanceof ApiRequestError && err.code === "signup_ticket_invalid");
        setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const field = (name: Field, label: string, control: (props: ControlProps) => ReactNode) => {
    const id = `profile-${name}`;
    const message = fieldErrors[name];
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {control({
          id,
          "aria-invalid": message ? true : undefined,
          "aria-describedby": message ? `${id}-error` : undefined,
        })}
        {message ? (
          <p id={`${id}-error`} className={styles.fieldError}>
            {message}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h1 className={styles.title}>Set up your centre</h1>
      <p className={styles.lead}>
        {formatIndianMobile(phone)} is verified. Tell us about your centre to finish signing up.
      </p>

      {field("fullName", "Your name", (p) => (
        <input {...p} className={styles.input} autoComplete="name" value={form.fullName} onChange={set("fullName")} autoFocus />
      ))}
      {field("centreName", "Centre name", (p) => (
        <input {...p} className={styles.input} autoComplete="organization" value={form.centreName} onChange={set("centreName")} />
      ))}
      {field("city", "City", (p) => (
        <input {...p} className={styles.input} autoComplete="address-level2" value={form.city} onChange={set("city")} />
      ))}
      {field("centreType", "Type of centre", (p) => (
        <select {...p} className={styles.input} value={form.centreType} onChange={set("centreType")}>
          <option value="" disabled>
            Choose one
          </option>
          {CENTRE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CENTRE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      ))}
      {field("email", "Email (optional)", (p) => (
        <input {...p} className={styles.input} type="email" autoComplete="email" value={form.email} onChange={set("email")} />
      ))}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          aria-invalid={fieldErrors.acceptedTerms ? true : undefined}
        />
        <span>
          I agree to Chukta’s <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy notice</Link>.
        </span>
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {expired ? (
        <button className={styles.secondary} type="button" onClick={onStartOver}>
          Verify my number again
        </button>
      ) : (
        <button className={styles.primary} type="submit" disabled={busy}>
          Create my centre
        </button>
      )}
    </form>
  );
}

type ControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};
