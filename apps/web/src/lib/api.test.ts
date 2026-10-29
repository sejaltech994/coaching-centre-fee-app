import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  apiBaseUrl,
  archiveBatch,
  createBatch,
  getCentre,
  listBatches,
  getGooglePending,
  getIdentities,
  logout,
  refreshSession,
  registerOwner,
  updateBatch,
  createFeePlan,
  listFeePlans,
  listInvoices,
  getPaymentSettings,
  getPublicInvoice,
  connectRazorpay,
  disconnectRazorpay,
  startCheckout,
  recordPayment,
  receiptPdf,
  savePaymentSettings,
  waiveInvoice,
  setDiscount,
  updateFeePlan,
  createStudent,
  endEnrolment,
  enrol,
  getStudent,
  listStudents,
  updateStudent,
  listSessions,
  signOutOtherSessions,
  signOutSession,
  setSessionHooks,
  updateCentre,
  updateMe,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  setSessionHooks(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API client", () => {
  it("talks to the local API by default", () => {
    expect(apiBaseUrl()).toBe("http://localhost:8787/api/v1");
  });

  it("uses NEXT_PUBLIC_API_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example/api/v1/");
    expect(apiBaseUrl()).toBe("https://api.example/api/v1");
  });

  it("signs up with the profile, sending the Google sign-in cookie", async () => {
    const session = { status: "signed_in", accessToken: "t", expiresIn: 900, isNewAccount: true, user: {}, centre: {} };
    reply(201, session);
    const profile = {
      fullName: "Asha Sharma",
      phone: "98765 43210",
      centreName: "Sunrise Classes",
      city: "Pune",
      centreType: "coaching",
      acceptedTerms: true,
    };

    await expect(registerOwner(profile)).resolves.toEqual(session);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8787/api/v1/auth/register");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init!.body as string)).toEqual(profile);
  });

  it("never answers from the browser's cache, so lists are always current", async () => {
    reply(200, { batches: [], nextCursor: null });
    await listBatches("t", { status: "all" });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
  });

  it("reads the Google account waiting to sign up", async () => {
    reply(200, { email: "asha@example.com", name: "Asha Sharma" });

    await expect(getGooglePending()).resolves.toEqual({ email: "asha@example.com", name: "Asha Sharma" });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8787/api/v1/auth/google/pending");
  });

  it("turns an error response into an ApiRequestError with the server's message", async () => {
    reply(409, { error: { code: "google_in_use", message: "This Google account already has a Chukta account." } });

    const error = await getGooglePending().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: "google_in_use",
      message: "This Google account already has a Chukta account.",
    });
  });

  it("reads Retry-After on rate limits", async () => {
    reply(429, { error: { code: "rate_limited", message: "Wait 20 seconds." } }, { "retry-after": "20" });

    await expect(getGooglePending()).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 20 });
  });

  it("explains a lost connection in plain words", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(getGooglePending()).rejects.toMatchObject({
      code: "network_error",
      message: "Can't reach Chukta. Check your connection and try again.",
    });
  });

  it("copes with an error response that isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));

    await expect(getGooglePending()).rejects.toMatchObject({
      status: 502,
      code: "http_502",
      message: "Something went wrong. Try again.",
    });
  });

  it("refreshes the session using the cookie", async () => {
    reply(200, { accessToken: "new", expiresIn: 900 });

    await expect(refreshSession()).resolves.toEqual({ accessToken: "new", expiresIn: 900 });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8787/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("logs out, accepting an empty 204 reply", async () => {
    reply(204);
    await expect(logout()).resolves.toBeUndefined();
  });

  it("lists batches with the chosen status", async () => {
    reply(200, { batches: [], nextCursor: null });

    await listBatches("token-123", { status: "all" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8787/api/v1/batches?status=all&limit=100");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer token-123");
  });

  it("creates, updates and archives batches", async () => {
    const batch = { id: "b1", name: "Yoga", subject: null, days: ["mon"], startTime: "07:00", endTime: "08:00", isActive: true, createdAt: "x" };
    reply(201, { batch });
    reply(200, { batch: { ...batch, name: "Morning yoga" } });
    reply(200, { batch: { ...batch, isActive: false } });
    const input = { name: "Yoga", subject: null, days: ["mon" as const], startTime: "07:00", endTime: "08:00", feePlanId: null };

    await expect(createBatch("t", input)).resolves.toEqual(batch);
    await expect(updateBatch("t", "b1", { name: "Morning yoga" })).resolves.toMatchObject({ name: "Morning yoga" });
    await expect(archiveBatch("t", "b1")).resolves.toMatchObject({ isActive: false });

    expect(fetchMock.mock.calls.map(([url, init]) => `${init!.method} ${url}`)).toEqual([
      "POST http://localhost:8787/api/v1/batches",
      "PATCH http://localhost:8787/api/v1/batches/b1",
      "DELETE http://localhost:8787/api/v1/batches/b1",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual(input);
  });

  it("passes on the fields at fault", async () => {
    reply(409, { error: { code: "batch_name_taken", message: "Taken.", fields: { name: "Taken." } } });

    await expect(
      createBatch("t", { name: "Yoga", subject: null, days: ["mon"], startTime: "07:00", endTime: "08:00", feePlanId: null }),
    ).rejects.toMatchObject({ status: 409, fields: { name: "Taken." } });
  });

  it("saves the owner's name and number, and the centre's details, from Settings", async () => {
    reply(200, { user: { fullName: "Asha S. Sharma" } });
    reply(200, { centre: { name: "Sunrise Academy" } });
    reply(200, { identities: [] });

    await updateMe("t", { fullName: "Asha S. Sharma", phone: "98765 43210" });
    await updateCentre("t", { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" });
    await getIdentities("t");

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/me", "PATCH", { fullName: "Asha S. Sharma", phone: "98765 43210" }],
      ["http://localhost:8787/api/v1/centre", "PATCH", { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" }],
      ["http://localhost:8787/api/v1/me/identities", "GET", undefined],
    ]);
  });

  it("lists devices and signs them out", async () => {
    reply(200, { sessions: [] });
    reply(204);
    reply(200, { signedOut: 2 });

    await listSessions("t");
    await signOutSession("t", "s1");
    await expect(signOutOtherSessions("t")).resolves.toEqual({ signedOut: 2 });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.method])).toEqual([
      ["http://localhost:8787/api/v1/me/sessions", "GET"],
      ["http://localhost:8787/api/v1/me/sessions/s1", "DELETE"],
      ["http://localhost:8787/api/v1/me/sessions/sign-out-others", "POST"],
    ]);
  });

  it("lists, adds, reads and changes students, and their batches", async () => {
    for (let i = 0; i < 6; i++) reply(200, {});

    await listStudents("t", { status: "left", batchId: "b1", q: "rao", cursor: "c1" });
    await createStudent("t", { name: "Aarav", parentName: "Neha", parentPhone: "98765 43210", whatsappOptIn: true, batchIds: ["b1"] });
    await getStudent("t", "s1");
    await updateStudent("t", "s1", { status: "left" });
    await enrol("t", "s1", "b2");
    await endEnrolment("t", "e1", "2026-11-02");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)])).toEqual([
      ["http://localhost:8787/api/v1/students?status=left&batchId=b1&q=rao&cursor=c1", "GET", undefined],
      [
        "http://localhost:8787/api/v1/students",
        "POST",
        { name: "Aarav", parentName: "Neha", parentPhone: "98765 43210", whatsappOptIn: true, batchIds: ["b1"] },
      ],
      ["http://localhost:8787/api/v1/students/s1", "GET", undefined],
      ["http://localhost:8787/api/v1/students/s1", "PATCH", { status: "left" }],
      ["http://localhost:8787/api/v1/enrolments", "POST", { studentId: "s1", batchId: "b2" }],
      ["http://localhost:8787/api/v1/enrolments/e1", "PATCH", { endDate: "2026-11-02" }],
    ]);
  });

  it("leaves out list filters that aren't set", async () => {
    reply(200, { students: [], nextCursor: null });
    await listStudents("t", { status: "active" });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8787/api/v1/students?status=active");
  });

  it("lists, creates and changes fee plans, and sets a student's discount", async () => {
    for (let i = 0; i < 4; i++) reply(200, {});
    const plan = { name: "Monthly", amountPaise: 250000, cycle: "monthly" as const, dueDay: 5, lateFeePaise: null, lateFeeAfterDays: null };

    await listFeePlans("t", { status: "all" });
    await createFeePlan("t", plan);
    await updateFeePlan("t", "p1", { isActive: false });
    await setDiscount("t", "e1", 25000);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)])).toEqual([
      ["http://localhost:8787/api/v1/fee-plans?status=all", "GET", undefined],
      ["http://localhost:8787/api/v1/fee-plans", "POST", plan],
      ["http://localhost:8787/api/v1/fee-plans/p1", "PATCH", { isActive: false }],
      ["http://localhost:8787/api/v1/enrolments/e1", "PATCH", { discountPaise: 25000 }],
    ]);
  });

  it("lists bills with only the filters that are set, and waives one with a reason", async () => {
    reply(200, { invoices: [], nextCursor: null });
    reply(200, { invoices: [], nextCursor: null });
    reply(200, { invoice: { id: "i1", status: "waived" } });

    await listInvoices("t", { status: "unpaid" });
    await listInvoices("t", { status: "all", month: "2026-11", studentId: "s1", batchId: "", cursor: "c" });
    await waiveInvoice("t", "i1", "Scholarship");

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/invoices?status=unpaid", "GET", undefined],
      ["http://localhost:8787/api/v1/invoices?status=all&month=2026-11&studentId=s1&cursor=c", "GET", undefined],
      ["http://localhost:8787/api/v1/invoices/i1/waive", "POST", { reason: "Scholarship" }],
    ]);
  });

  it("reads and saves the centre's UPI ID, and records a payment for a bill", async () => {
    reply(200, { paymentSettings: { upiId: null, payeeName: null } });
    reply(200, { paymentSettings: { upiId: "sunrise@okicici", payeeName: "Sunrise" } });
    reply(201, { invoice: { id: "i1", status: "paid" } });

    await getPaymentSettings("t");
    await savePaymentSettings("t", { upiId: "sunrise@okicici", payeeName: "Sunrise" });
    await recordPayment("t", "i1", { method: "cash", reference: "", receivedOn: "2026-11-01" });

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/centre/payment-settings", "GET", undefined],
      ["http://localhost:8787/api/v1/centre/payment-settings", "PUT", { upiId: "sunrise@okicici", payeeName: "Sunrise" }],
      ["http://localhost:8787/api/v1/invoices/i1/payments", "POST", { method: "cash", reference: "", receivedOn: "2026-11-01" }],
    ]);
  });

  it("downloads a receipt as a PDF, with the access token", async () => {
    fetchMock.mockResolvedValueOnce(new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }));

    const pdf = await receiptPdf("t", "r1");

    expect(pdf.type).toBe("application/pdf");
    expect(await pdf.text()).toBe("%PDF-1.7");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8787/api/v1/receipts/r1/pdf");
  });

  it("reads a parent's bill from its pay link, without signing in", async () => {
    reply(200, { centre: { name: "Sunrise" } });
    await getPublicInvoice("abc");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8787/api/v1/public/invoices/abc");
    expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get("authorization")).toBeNull();
  });

  it("connects and disconnects Razorpay, and starts a parent's checkout without signing in", async () => {
    reply(200, { razorpay: { keyId: "rzp_test_a", webhookUrl: "u" } });
    reply(204);
    reply(200, { url: "https://rzp.io/i/a" });

    await connectRazorpay("t", { keyId: "rzp_test_a", keySecret: "s", webhookSecret: "w" });
    await disconnectRazorpay("t");
    await expect(startCheckout("abc")).resolves.toEqual({ url: "https://rzp.io/i/a" });

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/centre/razorpay", "PUT", { keyId: "rzp_test_a", keySecret: "s", webhookSecret: "w" }],
      ["http://localhost:8787/api/v1/centre/razorpay", "DELETE", undefined],
      ["http://localhost:8787/api/v1/public/invoices/abc/checkout", "POST", undefined],
    ]);
  });

  it("reads the centre with the access token", async () => {
    reply(200, { centre: { id: "c1", name: null, plan: "free", timezone: "Asia/Kolkata" } });

    const result = await getCentre("token-123");

    expect(result.centre.id).toBe("c1");
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer token-123");
  });
});

describe("API client when the access token runs out", () => {
  const unauthenticated = { error: { code: "unauthenticated", message: "Log in to continue." } };
  const centre = { centre: { id: "c1", name: null, plan: "free", timezone: "Asia/Kolkata" } };
  const sentToken = (call: number) => new Headers(fetchMock.mock.calls[call]![1]!.headers).get("authorization");

  function hooks(renewed: string | null, current: string | null = null) {
    const session = { current: vi.fn(() => current), renew: vi.fn(async () => renewed), ended: vi.fn() };
    setSessionHooks(session);
    return session;
  }

  it("gets a new access token and tries once more", async () => {
    const session = hooks("fresh");
    reply(401, unauthenticated);
    reply(200, centre);

    await expect(getCentre("stale")).resolves.toEqual(centre);

    expect(session.renew).toHaveBeenCalledWith("stale");
    expect([sentToken(0), sentToken(1)]).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(session.ended).not.toHaveBeenCalled();
  });

  it("sends the session's newest token, not the one the page started with", async () => {
    hooks(null, "newest");
    reply(200, centre);

    await getCentre("old");

    expect(sentToken(0)).toBe("Bearer newest");
  });

  it("ends the login when it can't be renewed", async () => {
    const session = hooks(null);
    reply(401, unauthenticated);

    await expect(getCentre("stale")).rejects.toMatchObject({ status: 401, code: "unauthenticated" });

    expect(session.ended).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves requests made without a token, and other errors, alone", async () => {
    const session = hooks("fresh");
    reply(401, unauthenticated);
    reply(403, { error: { code: "forbidden", message: "No." } });

    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
    await expect(getCentre("token")).rejects.toMatchObject({ status: 403 });

    expect(session.renew).not.toHaveBeenCalled();
    expect(session.ended).not.toHaveBeenCalled();
  });
});
