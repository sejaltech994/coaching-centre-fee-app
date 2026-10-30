import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getIdentities, getMe, listSessions, logout, updateCentre } from "@/lib/api";
import { getCachedCentre, setAccessToken } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import SettingsPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
  getIdentities: vi.fn(),
  listSessions: vi.fn(),
  updateCentre: vi.fn(),
  logout: vi.fn(),
}));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };

beforeEach(() => {
  replace.mockReset();
  vi.mocked(useSession).mockReturnValue({ token: "token", centre });
  vi.mocked(getMe).mockResolvedValue({
    user: { id: "u1", phone: "98765 43210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
    centre: { ...centre, city: "Pune", centreType: "coaching" },
  });
  vi.mocked(getIdentities).mockResolvedValue({ identities: [] });
  vi.mocked(listSessions).mockResolvedValue({ sessions: [] });
  vi.mocked(logout).mockResolvedValue(undefined);
});

describe("/settings", () => {
  it("sits in the app shell with Settings marked as the current page", async () => {
    render(<SettingsPage />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(await screen.findByRole("heading", { level: 1, name: "Profile and account" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Settings" }).find((l) => nav.contains(l))).toHaveAttribute("aria-current", "page");
  });

  it("shows a renamed centre in the shell straight away", async () => {
    vi.mocked(updateCentre).mockResolvedValue({ centre: { ...centre, name: "Sunrise Academy", city: "Pune", centreType: "coaching" } });
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Edit centre" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("complementary")).toHaveTextContent("Sunrise Academy");
    expect(getCachedCentre()).toMatchObject({ name: "Sunrise Academy" });
  });

  it("signs out to the login page", async () => {
    setAccessToken("token");
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
