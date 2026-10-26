import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getCentre } from "./api";
import { ensureAccessToken, getAccessToken, setAccessToken } from "./session";
import { useSession } from "./useSession";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), getCentre: vi.fn() }));
vi.mock("./session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session")>()),
  ensureAccessToken: vi.fn(),
}));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };

beforeEach(() => {
  replace.mockReset();
  vi.mocked(ensureAccessToken).mockReset().mockResolvedValue("token");
  vi.mocked(getCentre).mockReset().mockResolvedValue({ centre });
});

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

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getCentre).not.toHaveBeenCalled();
  });

  it("ends an expired session and sends the owner to log in", async () => {
    setAccessToken("stale");
    vi.mocked(getCentre).mockRejectedValueOnce(new ApiRequestError(401, "unauthenticated", "Log in to continue."));
    renderHook(() => useSession());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getAccessToken()).toBeNull();
  });

  it("loads only once, however often the page re-renders", async () => {
    const { result, rerender } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.centre).toEqual(centre));
    rerender();
    rerender();
    expect(getCentre).toHaveBeenCalledTimes(1);
  });
});
