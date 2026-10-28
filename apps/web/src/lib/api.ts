/** Typed client for the Chukta API (apps/api). See the TSD's API section. */
import type { BatchInput, CentreType, Weekday } from "@chukta/shared";

export type Me = {
  user: {
    id: string;
    phone: string;
    /** False until the owner confirms the number with a code. */
    phoneVerified: boolean;
    fullName: string | null;
    email: string | null;
    role: "owner";
  };
  centre: {
    id: string;
    name: string | null;
    city: string | null;
    centreType: CentreType | null;
    plan: "free" | "pro";
    timezone: string;
  };
};

export type LoginSession = Me & {
  status: "signed_in";
  accessToken: string;
  expiresIn: number;
  isNewAccount: boolean;
};

/** The Google account that just signed in and has no Chukta account yet. */
export type GooglePending = { email: string; name: string | null };

/** What sign-up sends; the API checks it with the shared validateProfile. */
export type RegisterInput = {
  fullName: string;
  phone: string;
  centreName: string;
  city: string;
  centreType: string;
  acceptedTerms: boolean;
};

export type CentreResponse = {
  centre: { id: string; name: string | null; plan: "free" | "pro"; timezone: string };
};

export type Batch = {
  id: string;
  name: string;
  subject: string | null;
  days: Weekday[];
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
};

export class ApiRequestError extends Error {
  readonly retryAfterSeconds?: number;
  /** Message per field at fault, for forms. */
  readonly fields?: Record<string, string>;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: { retryAfterSeconds?: number; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.fields = options.fields;
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
      // Always the server's current data, never a cached copy.
      cache: "no-store",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, "network_error", "Can't reach Chukta. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string; fields?: Record<string, string> } })
    | null;

  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiRequestError(
      res.status,
      payload?.error?.code ?? `http_${res.status}`,
      payload?.error?.message ?? "Something went wrong. Try again.",
      {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        fields: payload?.error?.fields,
      },
    );
  }
  return payload as T;
}

/** Signs up the Google account waiting in the API's cookie. */
export const registerOwner = (input: RegisterInput) =>
  call<LoginSession>("/auth/register", { method: "POST", body: input });

export const getMe = (token: string) => call<Me>("/me", { token });

/** Where "Continue with Google" goes: the API runs the OAuth flow and redirects back. */
export const googleStartUrl = () => `${apiBaseUrl()}/auth/google/start`;

export const getGooglePending = () => call<GooglePending>("/auth/google/pending");

export const refreshSession = () =>
  call<{ accessToken: string; expiresIn: number }>("/auth/refresh", { method: "POST" });

export const logout = () => call<void>("/auth/logout", { method: "POST" });

export const getCentre = (token: string) => call<CentreResponse>("/centre", { token });

// --- Batches ---

export const listBatches = (token: string, { status }: { status: "active" | "archived" | "all" }) =>
  // A centre has tens of batches at most; one page of 100 covers it.
  call<{ batches: Batch[]; nextCursor: string | null }>(`/batches?status=${status}&limit=100`, { token });

export const getBatch = async (token: string, id: string) =>
  (await call<{ batch: Batch }>(`/batches/${encodeURIComponent(id)}`, { token })).batch;

export const createBatch = async (token: string, input: BatchInput) =>
  (await call<{ batch: Batch }>("/batches", { method: "POST", body: input, token })).batch;

export const updateBatch = async (token: string, id: string, changes: Partial<BatchInput> & { isActive?: boolean }) =>
  (await call<{ batch: Batch }>(`/batches/${id}`, { method: "PATCH", body: changes, token })).batch;

/** The API archives rather than deletes. */
export const archiveBatch = async (token: string, id: string) =>
  (await call<{ batch: Batch }>(`/batches/${id}`, { method: "DELETE", token })).batch;
