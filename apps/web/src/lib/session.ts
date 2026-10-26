import { refreshSession } from "./api";

// The access token lives in memory only, never in localStorage, so a script
// injected into the page can't read it from storage. After a reload it is
// restored from the httpOnly refresh cookie.
let accessToken: string | null = null;
let pendingRefresh: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearSession(): void {
  accessToken = null;
  pendingRefresh = null;
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
