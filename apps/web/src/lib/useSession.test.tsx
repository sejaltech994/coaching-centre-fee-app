import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getCentre } from "./api";
import { checkLogin, clearSession, ensureAccessToken, getAccessToken, setAccessToken } from "./session";
import { useSession } from "./useSession";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), getCentre: vi.fn() }));
vi.mock("./session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session")>()),
  ensureAccessToken: vi.fn(),
  checkLogin: vi.fn(),
}));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };

beforeEach(() => {
  clearSession();
  replace.mockReset();
  vi.mocked(ensureAccessToken).mockReset().mockResolvedValue("token");
  vi.mocked(getCentre).mockReset().mockResolvedValue({ centre });
  vi.mocked(checkLogin).mockReset();
});

function showTab(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useSession", () => {
  it("provides the access token and the owner's centre", async () => {
    const { result } = renderHook(() => useSession());

    expect(result.current).toEqual({ token: null, centre: null });
    await waitFor(() => expect(result.current).toEqual({ token: "token", centre }));
    expect(getCentre).toHaveBeenCalledWith("token");
  });

  it("sends visitors without a session to log in", async () => {
    vi.mocked(ensureAccessToken).mockResolvedValueOnce(null);
    renderHook(() => useSession());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/?session=required"));
    expect(getCentre).not.toHaveBeenCalled();
  });

  it("ends an expired session and sends the owner to log in", async () => {
    setAccessToken("stale");
    vi.mocked(getCentre).mockRejectedValueOnce(new ApiRequestError(401, "unauthenticated", "Log in to continue."));
    renderHook(() => useSession());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/?session=expired"));
    expect(getAccessToken()).toBeNull();
  });

  it("hands over the token before the centre has loaded, so pages can load their data in parallel", async () => {
    let finishCentre: (value: { centre: typeof centre }) => void = () => {};
    vi.mocked(getCentre).mockReturnValueOnce(new Promise((resolve) => (finishCentre = resolve)));
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.token).toBe("token"));
    expect(result.current.centre).toBeNull();

    finishCentre({ centre });
    await waitFor(() => expect(result.current.centre).toEqual(centre));
  });

  it("remembers the centre between pages instead of fetching it again", async () => {
    const first = renderHook(() => useSession());
    await waitFor(() => expect(first.result.current.centre).toEqual(centre));
    first.unmount();

    const second = renderHook(() => useSession());

    expect(second.result.current.centre).toEqual(centre);
    await waitFor(() => expect(second.result.current.token).toBe("token"));
    expect(getCentre).toHaveBeenCalledTimes(1);
  });

  it("loads only once, however often the page re-renders", async () => {
    const { result, rerender } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.centre).toEqual(centre));
    rerender();
    rerender();
    expect(getCentre).toHaveBeenCalledTimes(1);
  });

  it("checks the login is still good when the owner comes back to the tab", async () => {
    const { unmount } = renderHook(() => useSession());

    showTab("hidden");
    expect(checkLogin).not.toHaveBeenCalled();
    showTab("visible");
    expect(checkLogin).toHaveBeenCalledTimes(1);

    unmount();
    showTab("visible");
    expect(checkLogin).toHaveBeenCalledTimes(1);
  });

  it("goes back to the page the owner was sent away from, once signed in", async () => {
    window.sessionStorage.setItem("chukta.returnTo", "/fees/");
    renderHook(() => useSession());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fees/"));
    expect(window.sessionStorage.getItem("chukta.returnTo")).toBeNull();
  });
});
