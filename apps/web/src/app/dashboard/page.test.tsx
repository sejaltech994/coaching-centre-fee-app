import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMe } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
}));

const owner = (phoneVerified: boolean) => ({
  user: { id: "u1", phone: "+919876543210", phoneVerified, fullName: "Asha Sharma", email: "asha@example.com", role: "owner" as const },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching" as const, plan: "free" as const, timezone: "Asia/Kolkata" },
});

const centre = (name: string | null) => ({ id: "c1", name, plan: "free" as const, timezone: "Asia/Kolkata" });

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: centre("Sunrise Classes") });
  vi.mocked(getMe).mockReset().mockResolvedValue(owner(true));
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

  it("asks the owner to confirm their mobile number for WhatsApp reminders", async () => {
    vi.mocked(getMe).mockResolvedValue(owner(false));
    render(<DashboardPage />);

    expect(await screen.findByText("Confirm your mobile number to start sending fee reminders on WhatsApp.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Confirm number" })).toHaveAttribute("href", "/settings");
  });

  it("says nothing about the number once it is confirmed", async () => {
    render(<DashboardPage />);
    await vi.waitFor(() => expect(getMe).toHaveBeenCalledWith("token"));
    expect(screen.queryByText(/Confirm your mobile number/)).not.toBeInTheDocument();
  });

  it("points to setting up batches first", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("link", { name: "Set up batches" })).toHaveAttribute("href", "/batches");
  });

  it("sits in the app shell with Dashboard marked as the current page", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });
});
