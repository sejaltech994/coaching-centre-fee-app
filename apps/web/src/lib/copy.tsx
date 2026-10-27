import { fill, resolveCopy } from "@chukta/content";
import { Fragment, type ReactNode } from "react";
import { ApiRequestError } from "./api";

function bakedIn(): unknown {
  // next.config replaces process.env.CHUKTA_COPY with the CMS text at build time.
  // Unset in tests and local builds without a CMS: the built-in text applies.
  const json = process.env.CHUKTA_COPY;
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** All app text: the CMS (Sanity) wording baked into this build, over the built-in wording. */
export const copy = resolveCopy(bakedIn()).copy;

export { fill };

/** The editable text for an API error, falling back to the server's own message for codes the copy doesn't cover. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return copy.errors.generic;
  const e = copy.errors;
  switch (err.code) {
    case "network_error":
      return e.network;
    case "invalid_otp":
      return err.attemptsLeft === 1 ? e.invalidOtpLastTry : fill(e.invalidOtp, { tries: err.attemptsLeft ?? "" });
    case "otp_resend_too_soon":
      return fill(e.resendTooSoon, { seconds: err.retryAfterSeconds ?? 30 });
    case "rate_limited":
      return e.rateLimited;
    case "too_many_attempts":
      return e.tooManyAttempts;
    case "otp_expired":
      return e.otpExpired;
    case "sms_unavailable":
      return e.smsUnavailable;
    case "signup_ticket_invalid":
      return e.signupExpired;
    case "account_exists":
      return e.accountExists;
    default:
      return err.message;
  }
}

/** Text with {placeholders} replaced by elements, e.g. links inside a sentence. */
export function withParts(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
  });
}
