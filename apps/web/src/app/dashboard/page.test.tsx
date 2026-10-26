import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "@/lib/useSession";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));

const centre = (name: string | null) => ({ id: "c1", name, plan: "free" as const, timezone: "Asia/Kolkata" });

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: centre("Sunrise Classes") });
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

  it("points to setting up batches first", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("link", { name: "Set up batches" })).toHaveAttribute("href", "/batches");
  });

  it("sits in the app shell with Dashboard marked as the current page", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });
});
