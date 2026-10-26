"use client";

import { formatIndianMobile, normalizeIndianMobile } from "@chukta/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, requestOtp, verifyOtp, type LoginSession } from "@/lib/api";
import { setAccessToken } from "@/lib/session";
import styles from "./auth.module.css";

type Props = {
  initialPhone?: string;
  onLoggedIn: (session: LoginSession) => void;
};

const messageFor = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.";

/** Phone number → SMS code → logged in. The TSD's phone OTP login. */
export function LoginFlow({ initialPhone = "", onLoggedIn }: Props) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  async function send(to: string) {
    setBusy(true);
    setError(null);
    try {
      const { resendAfterSeconds } = await requestOtp(to);
      setPhone(to);
      setCode("");
      setStep("code");
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAt(sentAt + resendAfterSeconds * 1000);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeIndianMobile(phoneInput);
    if (!normalized) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    void send(normalized);
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!phone) return;
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await verifyOtp(phone, code);
      setAccessToken(session.accessToken);
      onLoggedIn(session);
    } catch (err) {
      setError(messageFor(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function changeNumber() {
    setStep("phone");
    setError(null);
    setCode("");
  }

  const errorBox = error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : null;

  if (step === "phone") {
    return (
      <form className={styles.form} onSubmit={submitPhone} noValidate>
        <h1 className={styles.title}>Log in to Chukta</h1>
        <p className={styles.lead}>We&rsquo;ll send a 6-digit code to your phone. New here? This creates your account.</p>
        <label className={styles.label} htmlFor="login-phone">
          Mobile number
        </label>
        <input
          id="login-phone"
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          aria-invalid={error ? true : undefined}
          autoFocus
        />
        {errorBox}
        <button className={styles.primary} type="submit" disabled={busy}>
          Get OTP
        </button>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={submitCode} noValidate>
      <h1 className={styles.title}>Enter your code</h1>
      <p className={styles.lead}>We sent a 6-digit code to {formatIndianMobile(phone!)}. It is valid for 5 minutes.</p>
      <label className={styles.label} htmlFor="login-code">
        6-digit code
      </label>
      <input
        id="login-code"
        className={`${styles.input} ${styles.code}`}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={error ? true : undefined}
        autoFocus
      />
      {errorBox}
      <button className={styles.primary} type="submit" disabled={busy}>
        Verify and log in
      </button>
      <div className={styles.secondaryRow}>
        <button className={styles.link} type="button" onClick={changeNumber}>
          Change number
        </button>
        <button
          className={styles.link}
          type="button"
          disabled={busy || resendIn > 0}
          onClick={() => void send(phone!)}
        >
          {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, "0")}` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
