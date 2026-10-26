import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCentre, logout } from "@/lib/api";
import { ensureAccessToken, getAccessToken, setAccessToken } from "@/lib/session";
import DashboardPage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCentre: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  ensureAccessToken: vi.fn(),
}));

const centre = (name: string | null) => ({ centre: { id: "c1", name, plan: "free" as const, timezone: "Asia/Kolkata" } });

beforeEach(() => {
  replace.mockReset();
  vi.mocked(ensureAccessToken).mockReset().mockResolvedValue("token");
  vi.mocked(getCentre).mockReset().mockResolvedValue(centre("Sunrise Classes"));
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});

describe("/dashboard", () => {
  it("sends visitors without a session to the login page", async () => {
    vi.mocked(ensureAccessToken).mockResolvedValueOnce(null);
    render(<DashboardPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getCentre).not.toHaveBeenCalled();
  });

  it("welcomes the owner to their centre", async () => {
    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "Sunrise Classes" })).toBeInTheDocument();
    expect(screen.getByText("Free plan")).toBeInTheDocument();
    expect(getCentre).toHaveBeenCalledWith("token");
  });

  it("asks a new owner to name their centre", async () => {
    vi.mocked(getCentre).mockResolvedValueOnce(centre(null));
    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "Welcome to Chukta" })).toBeInTheDocument();
    expect(screen.getByText(/name your centre/i)).toBeInTheDocument();
  });

  it("logs out and returns to the login page", async () => {
    setAccessToken("token");
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(logout).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("returns to login if the centre can't be loaded", async () => {
    vi.mocked(getCentre).mockRejectedValueOnce(new Error("401"));
    render(<DashboardPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
