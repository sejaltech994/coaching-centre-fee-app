import { logout, refreshSession, setSessionHooks, type CentreResponse } from "./api";
import { navigate } from "./navigate";

// The access token lives in memory only, never in localStorage, so a script
// injected into the page can't read it from storage. After a reload it is
// restored from the httpOnly refresh cookie.
let accessToken: string | null = null;
let pendingRefresh: Promise<string | null> | null = null;
// The owner's centre, remembered between pages so each page doesn't refetch it.
let centre: CentreResponse["centre"] | null = null;
// Set while logging out after the login ended, so many failing requests log out once.
let ending: Promise<void> | null = null;

export function getCachedCentre(): CentreResponse["centre"] | null {
  return centre;
}

export function setCachedCentre(value: CentreResponse["centre"]): void {
  centre = value;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearSession(): void {
  accessToken = null;
  pendingRefresh = null;
  centre = null;
  ending = null;
}

/** The current access token, restoring it from the refresh cookie if needed; null when logged out. */
export function ensureAccessToken(): Promise<string | null> {
  if (accessToken) return Promise.resolve(accessToken);
  // Refresh tokens rotate on use, so concurrent callers must share one refresh.
  pendingRefresh ??= refreshSession()
    .then(({ accessToken: token }) => {
      accessToken = token;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      pendingRefresh = null;
    });
  return pendingRefresh;
}

/** A new access token in place of `stale`: the one another request already got, or one from the refresh cookie. */
export function renewAccessToken(stale: string): Promise<string | null> {
  if (accessToken && accessToken !== stale) return Promise.resolve(accessToken);
  accessToken = null;
  return ensureAccessToken();
}

/**
 * The login has ended (it ran out, or this device was signed out elsewhere):
 * log out of the app and go to sign-in, which says why.
 */
export function endLogin(): Promise<void> {
  ending ??= logout()
    .catch(() => undefined)
    .then(() => {
      clearSession();
      // Keep the guard until the page is gone, so later failures don't navigate again.
      ending = Promise.resolve();
      navigate("/login/?session=expired");
    });
  return ending;
}

/** Seconds since 1970 when an access token (a JWT) runs out; null if it can't be read. */
function expiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: unknown };
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** When the owner comes back to the tab: renews a token that ran out meanwhile, or logs out if the login has ended. */
export async function checkLogin(): Promise<void> {
  const exp = accessToken && expiresAt(accessToken);
  if (!accessToken || !exp || exp * 1000 > Date.now()) return;
  if (!(await renewAccessToken(accessToken))) await endLogin();
}

setSessionHooks({ current: getAccessToken, renew: renewAccessToken, ended: () => void endLogin() });
