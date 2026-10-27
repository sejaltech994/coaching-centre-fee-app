import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  apiBaseUrl,
  archiveBatch,
  createBatch,
  getCentre,
  listBatches,
  logout,
  refreshSession,
  requestOtp,
  updateBatch,
  verifyOtp,
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

  it("requests an OTP with the phone number, sending cookies", async () => {
    reply(202, { expiresInSeconds: 300, resendAfterSeconds: 30 });

    await expect(requestOtp("+919876543210")).resolves.toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8787/api/v1/auth/otp/request");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init!.body as string)).toEqual({ phone: "+919876543210" });
  });

  it("never answers from the browser's cache, so lists are always current", async () => {
    reply(200, { batches: [], nextCursor: null });
    await listBatches("t", { status: "all" });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
  });

  it("verifies an OTP and returns the session", async () => {
    const session = { accessToken: "t", expiresIn: 900, isNewAccount: true, user: {}, centre: {} };
    reply(200, session);

    await expect(verifyOtp("+919876543210", "123456")).resolves.toEqual(session);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ phone: "+919876543210", code: "123456" });
  });

  it("turns an error response into an ApiRequestError with the server's message", async () => {
    reply(400, { error: { code: "invalid_otp", message: "That code is not right. 4 attempts left.", attemptsLeft: 4 } });

    const error = await verifyOtp("+919876543210", "000000").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 400,
      code: "invalid_otp",
      message: "That code is not right. 4 attempts left.",
      attemptsLeft: 4,
    });
  });

  it("reads Retry-After on rate limits", async () => {
    reply(429, { error: { code: "otp_resend_too_soon", message: "Wait 20 seconds." } }, { "retry-after": "20" });

    await expect(requestOtp("+919876543210")).rejects.toMatchObject({ code: "otp_resend_too_soon", retryAfterSeconds: 20 });
  });

  it("explains a lost connection in plain words", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(requestOtp("+919876543210")).rejects.toMatchObject({
      code: "network_error",
      message: "Can't reach Chukta. Check your connection and try again.",
    });
  });

  it("copes with an error response that isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));

    await expect(requestOtp("+919876543210")).rejects.toMatchObject({
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

  it("reads the centre with the access token", async () => {
    reply(200, { centre: { id: "c1", name: null, plan: "free", timezone: "Asia/Kolkata" } });

    const result = await getCentre("token-123");

    expect(result.centre.id).toBe("c1");
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer token-123");
  });
});
