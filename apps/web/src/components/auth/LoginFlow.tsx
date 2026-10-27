"use client";

import { formatIndianMobile, normalizeIndianMobile } from "@chukta/shared";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  getGooglePending,
  googleStartUrl,
  requestOtp,
  verifyOtp,
  type GooglePending,
  type LoginSession,
} from "@/lib/api";
import { copy, errorMessage, fill, googleErrorMessage, withParts } from "@/lib/copy";
import { navigate } from "@/lib/navigate";
import { setAccessToken } from "@/lib/session";
import styles from "./auth.module.css";
import { CodeInput } from "./CodeInput";
import { ProfileSetup } from "./ProfileSetup";

type Props = {
  /** A number sent from the landing page's form; skips the welcome screen. */
  initialPhone?: string;
  /** This build has Google sign-in (NEXT_PUBLIC_GOOGLE_SIGN_IN=on). */
  googleEnabled?: boolean;
  /** "google": back from Google with an account waiting for a mobile number (?via=google). */
  via?: string;
  /** "email_in_use": that Google email already has an account (?hint=…). */
  hint?: string;
  /** Why Google sent the owner back (?google_error=…). */
  googleError?: string;
  onSignedIn: (session: LoginSession) => void;
};

type Step =
  | { name: "loading" }
  | { name: "welcome" }
  | { name: "phone" }
  | { name: "code"; phone: string }
  | { name: "profile"; phone: string; signupTicket: string; google?: GooglePending };

const t = copy.auth;

const Legal = () => (
  <p className={styles.fineprint}>
    {withParts(t.legalNotice, {
      terms: <Link href="/terms">{t.termsLink}</Link>,
      privacy: <Link href="/privacy">{t.privacyLink}</Link>,
    })}
  </p>
);

/**
 * Sign-up and login in one flow, per the "Sign up, Login & Profile" design:
 * Welcome → Your mobile number → Enter the code → (new numbers) Set up your centre.
 */
export function LoginFlow({ initialPhone = "", googleEnabled = false, via, hint, googleError, onSignedIn }: Props) {
  const afterGoogle = via === "google";
  const [step, setStep] = useState<Step>(
    afterGoogle ? { name: "loading" } : initialPhone ? { name: "phone" } : { name: "welcome" },
  );
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(googleError ? googleErrorMessage(googleError) : null);
  // The Google account waiting for a verified mobile number, if any.
  const [google, setGoogle] = useState<GooglePending | null>(null);
  const [wrongCode, setWrongCode] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counting down to a deadline (not decrementing a counter) stays correct when
  // the phone sleeps the tab or timers fire late.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (!afterGoogle) return;
    let current = true;
    getGooglePending()
      .then((pending) => {
        if (!current) return;
        setGoogle(pending);
        setStep({ name: "phone" });
      })
      .catch((err) => {
        if (!current) return;
        setError(err instanceof ApiRequestError && err.status === 404 ? copy.errors.googleExpired : errorMessage(err));
        setStep({ name: "welcome" });
      });
    return () => {
      current = false;
    };
  }, [afterGoogle]);

  function goTo(next: Step) {
    setStep(next);
    setError(null);
    setWrongCode(false);
    setCode("");
  }

  function signedIn(session: LoginSession) {
    setAccessToken(session.accessToken);
    onSignedIn(session);
  }

  async function send(phone: string) {
    setBusy(true);
    setError(null);
    try {
      const { resendAfterSeconds } = await requestOtp(phone);
      goTo({ name: "code", phone });
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAt(sentAt + resendAfterSeconds * 1000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeIndianMobile(phoneInput);
    if (!normalized) {
      setError(t.phoneInvalid);
      return;
    }
    void send(normalized);
  }

  async function submitCode(event: FormEvent, phone: string) {
    event.preventDefault();
    if (code.length !== 6) {
      setError(t.codeIncomplete);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, code);
      if (result.status === "signup_required") {
        goTo({ name: "profile", phone: result.phone, signupTicket: result.signupTicket, google: result.google });
      } else {
        signedIn(result);
      }
    } catch (err) {
      setError(errorMessage(err));
      setWrongCode(err instanceof ApiRequestError && err.code === "invalid_otp");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : null;

  const back = (to: Step) => (
    <button className={styles.back} type="button" onClick={() => goTo(to)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t.back}
    </button>
  );

  switch (step.name) {
    case "loading":
      return null;

    case "welcome":
      return (
        <div className={styles.form}>
          <h1 className={styles.title}>{t.welcomeTitle}</h1>
          <p className={styles.lead}>{t.welcomeLead}</p>
          {errorBox}
          {googleEnabled ? (
            <button className={styles.google} type="button" onClick={() => navigate(googleStartUrl())}>
              <GoogleMark />
              {t.continueWithGoogle}
            </button>
          ) : null}
          <button className={styles.primary} type="button" onClick={() => goTo({ name: "phone" })}>
            {t.continueWithMobile}
          </button>
          <Legal />
        </div>
      );

    case "phone":
      return (
        <form className={styles.form} onSubmit={submitPhone} noValidate>
          {back({ name: "welcome" })}
          <h1 className={styles.title}>{google ? t.googlePhoneTitle : t.phoneTitle}</h1>
          <p className={styles.lead}>
            {google
              ? hint === "email_in_use"
                ? t.googleEmailInUse
                : fill(t.googlePhoneLead, { email: google.email })
              : t.phoneLead}
          </p>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-phone">
              {t.phoneLabel}
            </label>
            <div className={styles.prefixed}>
              <span className={styles.prefix} aria-hidden="true">
                +91
              </span>
              <input
                id="login-phone"
                className={styles.input}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby="login-phone-hint"
                autoFocus
              />
            </div>
            <p id="login-phone-hint" className={styles.hint}>
              {t.phoneHint}
            </p>
          </div>
          {errorBox}
          <button className={styles.primary} type="submit" disabled={busy}>
            {t.sendCode}
          </button>
          <Legal />
        </form>
      );

    case "code":
      return (
        <form className={styles.form} onSubmit={(e) => void submitCode(e, step.phone)} noValidate>
          {back({ name: "phone" })}
          <h1 className={styles.title}>{t.codeTitle}</h1>
          <p className={styles.lead}>
            {fill(t.codeSentTo, { phone: formatIndianMobile(step.phone) })}{" "}
            <button className={styles.inlineLink} type="button" onClick={() => goTo({ name: "phone" })}>
              {t.changeNumber}
            </button>
          </p>
          <CodeInput
            value={code}
            onChange={(next) => {
              setCode(next);
              setWrongCode(false);
            }}
            invalid={wrongCode}
            disabled={busy}
            autoFocus
          />
          {errorBox}
          <p className={styles.hint}>
            <button
              className={styles.inlineLink}
              type="button"
              disabled={busy || resendIn > 0}
              onClick={() => void send(step.phone)}
            >
              {resendIn > 0 ? fill(t.resendIn, { time: `0:${String(resendIn).padStart(2, "0")}` }) : t.resend}
            </button>{" "}
            · {t.codeValidity}
          </p>
          <button className={styles.primary} type="submit" disabled={busy}>
            {t.verify}
          </button>
        </form>
      );

    case "profile":
      return (
        <ProfileSetup
          initial={step.google && { fullName: step.google.name ?? "", email: step.google.email }}
          signupTicket={step.signupTicket}
          phone={step.phone}
          onRegistered={signedIn}
          onStartOver={() => goTo({ name: "phone" })}
        />
      );
  }
}

/** Google's "G", in Google's colours, as its sign-in guidelines ask. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
