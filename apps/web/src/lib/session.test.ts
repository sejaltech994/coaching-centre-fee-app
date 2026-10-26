import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, refreshSession } from "./api";
import { clearSession, ensureAccessToken, getAccessToken, setAccessToken } from "./session";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  refreshSession: vi.fn(),
}));

beforeEach(() => {
  clearSession();
  vi.mocked(refreshSession).mockReset();
});

describe("session", () => {
  it("keeps the access token in memory only", () => {
    setAccessToken("abc");
    expect(getAccessToken()).toBe("abc");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    clearSession();
    expect(getAccessToken()).toBeNull();
  });

  it("returns the current token without calling the API", async () => {
    setAccessToken("abc");
    await expect(ensureAccessToken()).resolves.toBe("abc");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("restores the session from the refresh cookie after a page reload", async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "restored", expiresIn: 900 });

    await expect(ensureAccessToken()).resolves.toBe("restored");
    expect(getAccessToken()).toBe("restored");
  });

  it("returns null when there is no session to restore", async () => {
    vi.mocked(refreshSession).mockRejectedValueOnce(new ApiRequestError(401, "unauthenticated", "Log in to continue."));

    await expect(ensureAccessToken()).resolves.toBeNull();
  });

  it("shares one refresh between callers that ask at the same time", async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "once", expiresIn: 900 });

    const [a, b] = await Promise.all([ensureAccessToken(), ensureAccessToken()]);

    expect([a, b]).toEqual(["once", "once"]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
