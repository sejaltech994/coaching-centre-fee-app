/** Typed client for the Chukta API (apps/api). See the TSD's API section. */
import type { BatchInput, CentreType, FeeCycle, FeePlanInput, Weekday } from "@chukta/shared";

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

/** A way the owner signs in; Google is the only one. */
export type Identity = { provider: "google"; email: string; lastUsedAt: string | null };

/** A device the owner is signed in on (one sign-in). */
export type DeviceSession = { id: string; device: string; signedInAt: string; lastActiveAt: string; current: boolean };

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
  feePlan: FeePlan | null;
  createdAt: string;
};

/** What a batch's students are billed, and when; money in paise. */
export type FeePlan = FeePlanInput & { id: string; cycle: FeeCycle; isActive: boolean };

/** A batch a student is in now, with the plan they're billed on and their discount. */
export type StudentBatch = {
  id: string;
  name: string;
  enrolmentId: string;
  since: string;
  feePlan: FeePlan | null;
  discountPaise: number;
};

export type StudentSummary = {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  whatsappOptIn: boolean;
  status: "active" | "left";
  batches: StudentBatch[];
};

export type Enrolment = {
  id: string;
  batch: { id: string; name: string };
  startDate: string;
  endDate: string | null;
  discountPaise: number;
};

/** A student with every batch they've been in. */
export type StudentDetail = StudentSummary & { enrolments: Enrolment[] };

export type StudentInput = { name: string; parentName: string; parentPhone: string; whatsappOptIn: boolean };

export type StudentFilters = { status: "active" | "left" | "all"; batchId?: string; q?: string; cursor?: string };

export class ApiRequestError extends Error {
  /** After a wrong code: how many tries it has left. */
  readonly attemptsLeft?: number;
  readonly retryAfterSeconds?: number;
  /** Message per field at fault, for forms. */
  readonly fields?: Record<string, string>;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: { attemptsLeft?: number; retryAfterSeconds?: number; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.attemptsLeft = options.attemptsLeft;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.fields = options.fields;
  }
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787/api/v1").replace(/\/+$/, "");
}

/** How requests carry on when the access token runs out; session.ts plugs itself in. */
export type SessionHooks = {
  /** The newest access token, which may be fresher than the one a page was handed. */
  current: () => string | null;
  /** A new access token in place of `stale`, or null when the login has ended. */
  renew: (stale: string) => Promise<string | null>;
  /** The login has ended: log out of the app. */
  ended: () => void;
};

let session: SessionHooks | null = null;

export function setSessionHooks(hooks: SessionHooks | null): void {
  session = hooks;
}

type CallInit = { method?: string; body?: unknown; token?: string };

/**
 * A request to the API. With a token, a 401 means the access token ran out:
 * it is renewed and the request tried once more, or the login has ended.
 */
async function call<T>(path: string, init: CallInit = {}): Promise<T> {
  if (!init.token || !session) return send<T>(path, init);
  const token = session.current() ?? init.token;
  try {
    return await send<T>(path, { ...init, token });
  } catch (err) {
    if (!(err instanceof ApiRequestError && err.status === 401)) throw err;
    const renewed = await session.renew(token);
    if (!renewed) {
      session.ended();
      throw err;
    }
    return send<T>(path, { ...init, token: renewed });
  }
}

async function send<T>(path: string, init: CallInit): Promise<T> {
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
    | (T & { error?: { code: string; message: string; attemptsLeft?: number; fields?: Record<string, string> } })
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

export const updateMe = (token: string, changes: { fullName: string }) =>
  call<{ user: Me["user"] }>("/me", { method: "PATCH", body: changes, token });

/** Texts a code to confirm `phone`: the owner's number or one they're switching to. */
export const sendPhoneCode = (token: string, phone: string) =>
  call<{ expiresInSeconds: number; resendAfterSeconds: number }>("/me/phone/verify", { method: "POST", body: { phone }, token });

export const confirmPhone = (token: string, phone: string, code: string) =>
  call<{ user: Me["user"] }>("/me/phone/confirm", { method: "POST", body: { phone, code }, token });

export const listSessions = (token: string) => call<{ sessions: DeviceSession[] }>("/me/sessions", { token });

export const signOutSession = (token: string, id: string) =>
  call<void>(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE", token });

export const signOutOtherSessions = (token: string) =>
  call<{ signedOut: number }>("/me/sessions/sign-out-others", { method: "POST", token });

export const getIdentities = (token: string) => call<{ identities: Identity[] }>("/me/identities", { token });

/** Where "Continue with Google" goes: the API runs the OAuth flow and redirects back. */
export const googleStartUrl = () => `${apiBaseUrl()}/auth/google/start`;

export const getGooglePending = () => call<GooglePending>("/auth/google/pending");

export const refreshSession = () =>
  call<{ accessToken: string; expiresIn: number }>("/auth/refresh", { method: "POST" });

export const logout = () => call<void>("/auth/logout", { method: "POST" });

export const getCentre = (token: string) => call<CentreResponse>("/centre", { token });

export const updateCentre = (token: string, changes: { centreName: string; city: string; centreType: string }) =>
  call<{ centre: Me["centre"] }>("/centre", { method: "PATCH", body: changes, token });

// --- Batches ---

export const listBatches = (token: string, { status }: { status: "active" | "archived" | "all" }) =>
  // A centre has tens of batches at most; one page of 100 covers it.
  call<{ batches: Batch[]; nextCursor: string | null }>(`/batches?status=${status}&limit=100`, { token });

export const getBatch = async (token: string, id: string) =>
  (await call<{ batch: Batch }>(`/batches/${encodeURIComponent(id)}`, { token })).batch;

/** A batch as saved: its schedule and the fee plan its students are billed on. */
export type BatchSave = BatchInput & { feePlanId: string | null };

export const createBatch = async (token: string, input: BatchSave) =>
  (await call<{ batch: Batch }>("/batches", { method: "POST", body: input, token })).batch;

export const updateBatch = async (token: string, id: string, changes: Partial<BatchSave> & { isActive?: boolean }) =>
  (await call<{ batch: Batch }>(`/batches/${id}`, { method: "PATCH", body: changes, token })).batch;

/** The API archives rather than deletes. */
export const archiveBatch = async (token: string, id: string) =>
  (await call<{ batch: Batch }>(`/batches/${id}`, { method: "DELETE", token })).batch;

export const listStudents = (token: string, filters: StudentFilters) => {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return call<{ students: StudentSummary[]; nextCursor: string | null }>(`/students?${query}`, { token });
};

export const createStudent = (token: string, input: StudentInput & { batchIds: string[] }) =>
  call<{ student: StudentSummary }>("/students", { method: "POST", body: input, token });

export const getStudent = (token: string, id: string) =>
  call<{ student: StudentDetail }>(`/students/${encodeURIComponent(id)}`, { token }).then(({ student }) => student);

export const updateStudent = (token: string, id: string, changes: Partial<StudentInput> & { status?: "active" | "left" }) =>
  call<{ student: StudentSummary }>(`/students/${encodeURIComponent(id)}`, { method: "PATCH", body: changes, token });

/** Puts a student in a batch from today. */
export const enrol = (token: string, studentId: string, batchId: string) =>
  call<{ enrolment: Enrolment }>("/enrolments", { method: "POST", body: { studentId, batchId }, token });

/** Takes a student out of a batch on `endDate` (YYYY-MM-DD). */
export const endEnrolment = (token: string, id: string, endDate: string) =>
  call<{ enrolment: Enrolment }>(`/enrolments/${encodeURIComponent(id)}`, { method: "PATCH", body: { endDate }, token });

export const listFeePlans = (token: string, { status }: { status: "active" | "all" }) =>
  call<{ feePlans: FeePlan[] }>(`/fee-plans?status=${status}`, { token });

export const createFeePlan = (token: string, input: FeePlanInput) =>
  call<{ feePlan: FeePlan }>("/fee-plans", { method: "POST", body: input, token });

export const updateFeePlan = (token: string, id: string, changes: Partial<FeePlanInput> & { isActive?: boolean }) =>
  call<{ feePlan: FeePlan }>(`/fee-plans/${encodeURIComponent(id)}`, { method: "PATCH", body: changes, token });

/** A student's discount on one batch's fee, in paise. */
export const setDiscount = (token: string, enrolmentId: string, discountPaise: number) =>
  call<{ enrolment: Enrolment }>(`/enrolments/${encodeURIComponent(enrolmentId)}`, {
    method: "PATCH",
    body: { discountPaise },
    token,
  });
