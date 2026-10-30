/** Typed client for the Chukta API (apps/api). See the TSD's API section. */
import type { BatchInput, CentreType, FeeCycle, FeePlanInput, InvoiceStatus, Weekday } from "@chukta/shared";

export type Me = {
  user: {
    id: string;
    /** The owner's own number, as typed; optional and never confirmed. */
    phone: string | null;
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
    /** When the account will be deleted, if the owner asked. */
    deletesAt?: string | null;
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

/** A device the owner is signed in on (one sign-in), and the city it was last seen in, if known. */
export type DeviceSession = { id: string; device: string; city: string | null; signedInAt: string; lastActiveAt: string; current: boolean };

export type CentreResponse = {
  centre: { id: string; name: string | null; plan: "free" | "pro"; timezone: string; deletesAt?: string | null };
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

/** A students CSV checked row by row (POST /students/import). */
export type ImportResult = {
  rows: {
    line: number;
    name: string;
    parentName: string;
    parentPhone: string;
    whatsappOptIn: boolean;
    batches: string[];
    errors: Record<string, string>;
  }[];
  valid: number;
  invalid: number;
  imported: number;
};

export type StudentInput = { name: string; parentName: string; parentPhone: string; whatsappOptIn: boolean };

export type StudentFilters = { status: "active" | "left" | "all"; batchId?: string; q?: string; cursor?: string };

/** A bill for one student, batch and billing period; money in paise. */
export type Invoice = {
  id: string;
  number: number;
  student: { id: string; name: string; parentName: string };
  batch: { id: string; name: string };
  cycle: FeeCycle;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountPaise: number;
  discountPaise: number;
  lateFeePaise: number;
  /** What's owed: the amount plus any late fee. */
  totalPaise: number;
  status: InvoiceStatus;
  paidAt: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  payment: {
    method: PaymentMethod;
    amountPaise: number;
    reference: string | null;
    receivedAt: string;
    receipt: { id: string; number: number } | null;
  } | null;
  /** The parent's page for this bill, to send them: no sign-in needed. */
  payLink: string;
  createdAt: string;
};

/** A WhatsApp message about a bill, and what became of it. */
export type Reminder = {
  id: string;
  kind: "pre_due" | "due" | "overdue_3" | "overdue_7" | "manual" | "payment_received";
  status: "sent" | "delivered" | "read" | "failed" | "skipped";
  template: string;
  error: string | null;
  invoice: { id: string; number: number };
  student: { id: string; name: string };
  sentAt: string | null;
  createdAt: string;
};

export type ReminderTone = "gentle" | "firm";

/** The centre's plan with Chukta (Free or Pro) and how much of it is used. */
export type Subscription = {
  plan: "free" | "pro";
  status: "created" | "active" | "cancelled" | "halted" | null;
  /** When Pro renews (or, once cancelled, ends). */
  renewsAt: string | null;
  proPricePaise: number;
  canUpgrade: boolean;
  students: { active: number; max: number | null };
};

/** A batch's students on a day, each present, absent or not yet marked (null). */
export type AttendanceDay = {
  batch: { id: string; name: string };
  date: string;
  students: { id: string; name: string; present: boolean | null }[];
};

/** A month's money and who owes (GET /dashboard/summary); money in paise. */
export type DashboardSummary = {
  month: string;
  collectedPaise: number;
  billedPaise: number;
  outstandingPaise: number;
  /** Every overdue bill, from any month. */
  overduePaise: number;
  defaulters: {
    student: { id: string; name: string; parentName: string };
    overduePaise: number;
    bills: number;
    oldestDueDate: string;
    invoiceIds: string[];
  }[];
};

export type PaymentMethod = "upi" | "cash" | "bank_transfer" | "card" | "netbanking" | "wallet";

/** What the owner records: UPI, cash or a bank transfer; the day it came (YYYY-MM-DD). */
export type PaymentInput = { method: "upi" | "cash" | "bank_transfer"; reference: string; receivedOn: string };

export type PaymentSettings = { upiId: string | null; payeeName: string | null };

/** The centre's own Razorpay account, once connected: where to point its webhooks. */
export type RazorpayAccount = { keyId: string; webhookUrl: string };

/** A bill as its parent sees it from the pay link. */
export type PublicInvoice = {
  centre: { name: string | null };
  invoice: {
    number: number;
    studentName: string;
    batchName: string;
    cycle: FeeCycle;
    periodStart: string;
    dueDate: string;
    totalPaise: number;
    lateFeePaise: number;
    status: InvoiceStatus;
  };
  /** The centre's own UPI, while the bill is unpaid and the centre has set it up. */
  upi: { upiId: string; payeeName: string; link: string } | null;
  receiptUrl: string | null;
  /** Cards, net banking and UPI through the centre's own Razorpay account. */
  card: boolean;
};

export type InvoiceFilters = {
  status: "unpaid" | InvoiceStatus | "all";
  /** YYYY-MM: bills due that month. */
  month?: string;
  batchId?: string;
  studentId?: string;
  cursor?: string;
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

type CallInit = { method?: string; body?: unknown; token?: string; as?: "json" | "blob" };

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
  if (res.ok && init.as === "blob") return (await res.blob()) as T;
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

export const updateMe = (token: string, changes: { fullName: string; phone: string | null }) =>
  call<{ user: Me["user"] }>("/me", { method: "PATCH", body: changes, token });

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

/** Checks a CSV without adding anyone. */
export const previewImport = (token: string, csv: string) =>
  call<ImportResult>("/students/import", { method: "POST", body: { csv, dryRun: true }, token });

/** Adds every student in the CSV, only if every row is right. */
export const importStudents = (token: string, csv: string) =>
  call<ImportResult>("/students/import", { method: "POST", body: { csv }, token });

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

// --- Fees ---

export const listInvoices = (token: string, filters: InvoiceFilters) => {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return call<{ invoices: Invoice[]; nextCursor: string | null }>(`/invoices?${query}`, { token });
};

export const waiveInvoice = (token: string, id: string, reason: string) =>
  call<{ invoice: Invoice }>(`/invoices/${encodeURIComponent(id)}/waive`, { method: "POST", body: { reason }, token });

export const recordPayment = (token: string, id: string, input: PaymentInput) =>
  call<{ invoice: Invoice }>(`/invoices/${encodeURIComponent(id)}/payments`, { method: "POST", body: input, token });

/** The receipt as a PDF file, to open or save. */
export const receiptPdf = (token: string, id: string) =>
  call<Blob>(`/receipts/${encodeURIComponent(id)}/pdf`, { token, as: "blob" });

export const getPaymentSettings = (token: string) =>
  call<{ paymentSettings: PaymentSettings & { razorpay: RazorpayAccount | null } }>("/centre/payment-settings", { token });

export const connectRazorpay = (token: string, keys: { keyId: string; keySecret: string; webhookSecret: string }) =>
  call<{ razorpay: RazorpayAccount }>("/centre/razorpay", { method: "PUT", body: keys, token });

export const disconnectRazorpay = (token: string) => call<void>("/centre/razorpay", { method: "DELETE", token });

/** The Razorpay checkout for a parent's bill, on the centre's own account. */
export const startCheckout = (token: string) =>
  call<{ url: string }>(`/public/invoices/${encodeURIComponent(token)}/checkout`, { method: "POST" });

export const savePaymentSettings = (token: string, settings: PaymentSettings) =>
  call<{ paymentSettings: PaymentSettings }>("/centre/payment-settings", { method: "PUT", body: settings, token });

/** A parent's bill from its pay link's token. */
export const getPublicInvoice = (token: string) => call<PublicInvoice>(`/public/invoices/${encodeURIComponent(token)}`);

// --- Reminders ---

export const listReminders = (token: string, cursor?: string) =>
  call<{ reminders: Reminder[]; nextCursor: string | null }>(`/reminders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token });

/** The exact WhatsApp message a bill's reminder would send now, and whether it can be sent. */
export const previewReminder = (token: string, invoiceId: string) =>
  call<{ text: string; canSend: boolean; reason: string | null }>(`/reminders/preview?invoiceId=${encodeURIComponent(invoiceId)}`, { token });

export const sendReminders = (token: string, invoiceIds: string[]) =>
  call<{ results: { invoiceId: string; status: "sent" | "skipped" | "failed"; error: string | null }[] }>("/reminders/send", {
    method: "POST",
    body: { invoiceIds },
    token,
  });

export const getReminderTone = (token: string) => call<{ tone: ReminderTone }>("/centre/reminder-tone", { token });

export const setReminderTone = (token: string, tone: ReminderTone) =>
  call<{ tone: ReminderTone }>("/centre/reminder-tone", { method: "PUT", body: { tone }, token });

export const getDashboardSummary = (token: string, month?: string) =>
  call<DashboardSummary>(`/dashboard/summary${month ? `?month=${encodeURIComponent(month)}` : ""}`, { token });

// --- Attendance ---

export const getAttendance = (token: string, batchId: string, date: string) =>
  call<AttendanceDay>(`/attendance?batchId=${encodeURIComponent(batchId)}&date=${encodeURIComponent(date)}`, { token });

export const saveAttendance = (token: string, day: { batchId: string; date: string; marks: { studentId: string; present: boolean }[] }) =>
  call<AttendanceDay & { absenceAlerts: { sent: number; skipped: number } }>("/attendance", { method: "PUT", body: day, token });

export const getAbsenceAlerts = (token: string) => call<{ on: boolean }>("/centre/absence-alerts", { token });

export const setAbsenceAlerts = (token: string, on: boolean) =>
  call<{ on: boolean }>("/centre/absence-alerts", { method: "PUT", body: { on }, token });

// --- Chukta's own plans ---

export const getSubscription = (token: string) => call<Subscription>("/subscription", { token });

/** Starts Pro: returns Razorpay's checkout for Chukta's own subscription. */
export const startPro = (token: string) => call<{ url: string }>("/subscription", { method: "POST", token });

export const cancelPro = (token: string) =>
  call<Pick<Subscription, "plan" | "status" | "renewsAt">>("/subscription/cancel", { method: "POST", token });

// --- Your data and deleting the account ---

/** Everything the centre has, as a JSON file (no keys or tokens). */
export const downloadMyData = (token: string) => call<Blob>("/me/export", { token, as: "blob" });

/** Asks for deletion in 30 days; every device is signed out. */
export const deleteAccount = (token: string, confirm: string) =>
  call<{ deletesAt: string }>("/me", { method: "DELETE", body: { confirm }, token });

export const keepAccount = (token: string) => call<{ deletesAt: null }>("/me/restore", { method: "POST", token });

/** Pro's monthly report: the month's bills and how each was paid, as a CSV file. */
export const downloadMonthlyReport = (token: string, month: string) =>
  call<Blob>(`/reports/monthly?month=${encodeURIComponent(month)}`, { token, as: "blob" });
