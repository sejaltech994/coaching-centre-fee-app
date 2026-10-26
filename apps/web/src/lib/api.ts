/** Typed client for the Chukta API (apps/api). See the TSD's API section. */

export type LoginSession = {
  accessToken: string;
  expiresIn: number;
  isNewAccount: boolean;
  user: { id: string; phone: string; name: string | null; role: "owner" };
  centre: { id: string; name: string | null; plan: "free" | "pro" };
};

export type CentreResponse = {
  centre: { id: string; name: string | null; plan: "free" | "pro"; timezone: string };
};

export class ApiRequestError extends Error {
  readonly attemptsLeft?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: { attemptsLeft?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.attemptsLeft = options.attemptsLeft;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787/api/v1").replace(/\/+$/, "");
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method: init.method ?? "GET",
      headers,
      // The refresh token travels in an httpOnly cookie set by the API.
      credentials: "include",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, "network_error", "Can't reach Chukta. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string; attemptsLeft?: number } })
    | null;

  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiRequestError(
      res.status,
      payload?.error?.code ?? `http_${res.status}`,
      payload?.error?.message ?? "Something went wrong. Try again.",
      {
        attemptsLeft: payload?.error?.attemptsLeft,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      },
    );
  }
  return payload as T;
}

export const requestOtp = (phone: string) =>
  call<{ expiresInSeconds: number; resendAfterSeconds: number }>("/auth/otp/request", {
    method: "POST",
    body: { phone },
  });

export const verifyOtp = (phone: string, code: string) =>
  call<LoginSession>("/auth/otp/verify", { method: "POST", body: { phone, code } });

export const refreshSession = () =>
  call<{ accessToken: string; expiresIn: number }>("/auth/refresh", { method: "POST" });

export const logout = () => call<void>("/auth/logout", { method: "POST" });

export const getCentre = (token: string) => call<CentreResponse>("/centre", { token });
