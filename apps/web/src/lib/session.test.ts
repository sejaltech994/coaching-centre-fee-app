import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getCentre, logout, refreshSession } from "./api";
import { navigate } from "./navigate";
import {
  checkLogin,
  clearSession,
  endLogin,
  ensureAccessToken,
  getAccessToken,
  renewAccessToken,
  setAccessToken,
} from "./session";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  refreshSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("./navigate", () => ({ navigate: vi.fn() }));

const loginEnded = () => new ApiRequestError(401, "unauthenticated", "Log in to continue.");
/** An access token (a JWT) that runs out `seconds` from now. */
const tokenExpiringIn = (seconds: number) =>
  `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;

beforeEach(() => {
  clearSession();
  vi.mocked(refreshSession).mockReset();
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
  vi.mocked(navigate).mockReset();
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
    vi.mocked(refreshSession).mockRejectedValueOnce(loginEnded());

    await expect(ensureAccessToken()).resolves.toBeNull();
  });

  it("shares one refresh between callers that ask at the same time", async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "once", expiresIn: 900 });

    const [a, b] = await Promise.all([ensureAccessToken(), ensureAccessToken()]);

    expect([a, b]).toEqual(["once", "once"]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});

describe("when the access token runs out", () => {
  it("hands back a token another request has already renewed", async () => {
    setAccessToken("new");
    await expect(renewAccessToken("old")).resolves.toBe("new");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("renews the token from the refresh cookie", async () => {
    setAccessToken("old");
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "fresh", expiresIn: 900 });

    await expect(renewAccessToken("old")).resolves.toBe("fresh");
    expect(getAccessToken()).toBe("fresh");
  });

  it("is renewed and retried by the API client", async () => {
    setAccessToken("old");
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "fresh", expiresIn: 900 });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { code: "unauthenticated", message: "Log in to continue." } }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ centre: { id: "c1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCentre("old")).resolves.toEqual({ centre: { id: "c1" } });
    vi.unstubAllGlobals();
  });
});

describe("when the login ends", () => {
  it("logs out and sends the owner to log in again, saying why", async () => {
    setAccessToken("old");

    await endLogin();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/login/?session=expired");
  });

  it("logs out once when several requests find out together", async () => {
    await Promise.all([endLogin(), endLogin(), endLogin()]);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("still leaves when the API can't be reached to log out", async () => {
    vi.mocked(logout).mockRejectedValueOnce(new ApiRequestError(0, "network_error", "Can't reach Chukta."));

    await endLogin();

    expect(navigate).toHaveBeenCalledWith("/login/?session=expired");
  });
});

describe("checking the login when the owner comes back", () => {
  it("leaves a token that's still good", async () => {
    setAccessToken(tokenExpiringIn(600));
    await checkLogin();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("renews a token that has run out", async () => {
    setAccessToken(tokenExpiringIn(-60));
    vi.mocked(refreshSession).mockResolvedValueOnce({ accessToken: "fresh", expiresIn: 900 });

    await checkLogin();

    expect(getAccessToken()).toBe("fresh");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("logs out when the login has ended", async () => {
    setAccessToken(tokenExpiringIn(-60));
    vi.mocked(refreshSession).mockRejectedValueOnce(loginEnded());

    await checkLogin();

    expect(navigate).toHaveBeenCalledWith("/login/?session=expired");
  });

  it("does nothing when nobody is logged in, or the token can't be read", async () => {
    await checkLogin();
    setAccessToken("not-a-jwt");
    await checkLogin();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
