import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardSummary, getMe } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
  getDashboardSummary: vi.fn(),
}));

const owner = () => ({
  user: { id: "u1", phone: "98765 43210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" as const },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching" as const, plan: "free" as const, timezone: "Asia/Kolkata" },
});

const centre = (name: string | null) => ({ id: "c1", name, plan: "free" as const, timezone: "Asia/Kolkata" });

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: centre("Sunrise Classes") });
  vi.mocked(getMe).mockReset().mockResolvedValue(owner());
  vi.mocked(getDashboardSummary)
    .mockReset()
    .mockResolvedValue({ month: "2026-11", collectedPaise: 0, billedPaise: 0, outstandingPaise: 0, overduePaise: 0, defaulters: [] });
});

describe("/dashboard", () => {
  it("shows nothing but a loading note until the session is ready", () => {
    vi.mocked(useSession).mockReturnValue({ token: null, centre: null });
    render(<DashboardPage />);
    expect(screen.getByText("Loading…")).toBeVisible();
  });

  it("welcomes the owner to their centre", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Sunrise Classes", level: 1 })).toBeVisible();
  });

  it("asks a new owner to name their centre", () => {
    vi.mocked(useSession).mockReturnValue({ token: "token", centre: centre(null) });
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Welcome to Chukta", level: 1 })).toBeVisible();
    expect(screen.getByText(/name your centre/i)).toBeVisible();
  });

  it("never asks the owner to confirm their mobile number", () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/Confirm your mobile number/)).not.toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });

  it("points to setting up batches first", async () => {
    render(<DashboardPage />);
    expect(await screen.findByRole("link", { name: "Set up batches" })).toHaveAttribute("href", "/batches");
  });

  it("sits in the app shell with Dashboard marked as the current page", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });
});
