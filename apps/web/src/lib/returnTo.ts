/**
 * Where an owner was when a page sent them to sign in, so they land back there
 * afterwards. It rides on the login page's ?next= and, through the Google round
 * trip, in this tab's sessionStorage. Only paths inside the app are kept, so the
 * link can't be used to send anyone elsewhere.
 */

const KEY = "chukta.returnTo";

/** A path inside the app (not sign-in itself), or null. */
export function safePath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return null;
  return raw;
}

/** The sign-in page, saying why, with where to come back to (the dashboard and home need none). */
export function loginUrl(reason: "required" | "expired"): string {
  const here = `${window.location.pathname}${window.location.search}`;
  const next = here === "/" || here.startsWith("/dashboard") ? null : safePath(here);
  return `/login/?session=${reason}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}

export function rememberReturn(raw: string | null): void {
  const path = safePath(raw);
  if (!path) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Storage blocked: the owner lands on the dashboard instead.
  }
}

/** The remembered path, once: reading it forgets it. */
export function takeReturn(): string | null {
  try {
    const path = safePath(window.sessionStorage.getItem(KEY));
    window.sessionStorage.removeItem(KEY);
    return path;
  } catch {
    return null;
  }
}
