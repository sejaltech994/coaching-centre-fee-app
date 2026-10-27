"use client";

import { formatIndianMobile, normalizeIndianMobile } from "@chukta/shared";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, requestOtp, verifyOtp, type LoginSession } from "@/lib/api";
import { copy, errorMessage, fill, withParts } from "@/lib/copy";
import { setAccessToken } from "@/lib/session";
import styles from "./auth.module.css";
import { CodeInput } from "./CodeInput";
import { ProfileSetup } from "./ProfileSetup";

type Props = {
  /** A number sent from the landing page's form; skips the welcome screen. */
  initialPhone?: string;
  onSignedIn: (session: LoginSession) => void;
};

type Step =
  | { name: "welcome" }
  | { name: "phone" }
  | { name: "code"; phone: string }
  | { name: "profile"; phone: string; signupTicket: string };

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
export function LoginFlow({ initialPhone = "", onSignedIn }: Props) {
  const [step, setStep] = useState<Step>(initialPhone ? { name: "phone" } : { name: "welcome" });
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
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
        goTo({ name: "profile", phone: result.phone, signupTicket: result.signupTicket });
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
    case "welcome":
      return (
        <div className={styles.form}>
          <h1 className={styles.title}>{t.welcomeTitle}</h1>
          <p className={styles.lead}>{t.welcomeLead}</p>
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
          <h1 className={styles.title}>{t.phoneTitle}</h1>
          <p className={styles.lead}>{t.phoneLead}</p>
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
          signupTicket={step.signupTicket}
          phone={step.phone}
          onRegistered={signedIn}
          onStartOver={() => goTo({ name: "phone" })}
        />
      );
  }
}
