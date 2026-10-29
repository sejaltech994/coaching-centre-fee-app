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
  confirmPhone,
  listSessions,
  signOutOtherSessions,
  signOutSession,
  sendPhoneCode,
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
    const input = { name: "Yoga", subject: null, days: ["mon" as const], startTime: "07:00", endTime: "08:00" };

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
      createBatch("t", { name: "Yoga", subject: null, days: ["mon"], startTime: "07:00", endTime: "08:00" }),
    ).rejects.toMatchObject({ status: 409, fields: { name: "Taken." } });
  });

  it("saves the owner's name and the centre's details from Settings", async () => {
    reply(200, { user: { fullName: "Asha S. Sharma" } });
    reply(200, { centre: { name: "Sunrise Academy" } });
    reply(200, { identities: [] });

    await updateMe("t", { fullName: "Asha S. Sharma" });
    await updateCentre("t", { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" });
    await getIdentities("t");

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, init!.body && JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/me", "PATCH", { fullName: "Asha S. Sharma" }],
      ["http://localhost:8787/api/v1/centre", "PATCH", { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" }],
      ["http://localhost:8787/api/v1/me/identities", "GET", undefined],
    ]);
  });

  it("sends and checks the code that confirms a mobile number", async () => {
    reply(202, { expiresInSeconds: 300, resendAfterSeconds: 30 });
    reply(200, { user: { phoneVerified: true } });

    await expect(sendPhoneCode("t", "91234 56789")).resolves.toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    await expect(confirmPhone("t", "91234 56789", "482913")).resolves.toEqual({ user: { phoneVerified: true } });

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init!.method, JSON.parse(init!.body as string)]);
    expect(sent).toEqual([
      ["http://localhost:8787/api/v1/me/phone/verify", "POST", { phone: "91234 56789" }],
      ["http://localhost:8787/api/v1/me/phone/confirm", "POST", { phone: "91234 56789", code: "482913" }],
    ]);
  });

  it("passes on how many tries a wrong code leaves", async () => {
    reply(400, { error: { code: "invalid_otp", message: "That code didn’t match. 4 tries left.", attemptsLeft: 4 } });
    await expect(confirmPhone("t", "9876543210", "000000")).rejects.toMatchObject({ code: "invalid_otp", attemptsLeft: 4 });
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

  it("reads the centre with the access token", async () => {
    reply(200, { centre: { id: "c1", name: null, plan: "free", timezone: "Asia/Kolkata" } });

    const result = await getCentre("token-123");

    expect(result.centre.id).toBe("c1");
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer token-123");
  });
});
