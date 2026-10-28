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
    case "google_in_use":
      return e.googleInUse;
    case "email_in_use":
      return e.emailInUse;
    case "google_pending_missing":
      return e.googleExpired;
    default:
      return err.message;
  }
}

/** Why the owner is back on the sign-in page (?google_error=…, from the API's Google callback or sign-up). */
export function googleErrorMessage(reason: string): string {
  const e = copy.errors;
  switch (reason) {
    case "cancelled":
      return e.googleCancelled;
    case "email_unverified":
      return e.googleEmailUnverified;
    case "unavailable":
      return e.googleUnavailable;
    case "expired":
      return e.googleExpired;
    case "email_in_use":
      return e.emailInUse;
    default:
      return e.googleFailed;
  }
}

/** Text with {placeholders} replaced by elements, e.g. links inside a sentence. */
export function withParts(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
  });
}
