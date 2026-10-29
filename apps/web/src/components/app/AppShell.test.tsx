import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logout } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/session";
import { AppShell } from "./AppShell";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), logout: vi.fn() }));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };

beforeEach(() => {
  replace.mockReset();
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});

describe("AppShell", () => {
  it("links to every built section, marking the current one", () => {
    render(<AppShell current="batches" centre={centre}>content</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute("href", "/students");
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    const batches = within(nav).getByRole("link", { name: "Batches" });
    expect(batches).toHaveAttribute("href", "/batches");
    expect(batches).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("shows the centre and its plan", () => {
    render(<AppShell current="dashboard" centre={centre}>content</AppShell>);
    expect(screen.getByText("Sunrise Classes")).toBeVisible();
    expect(screen.getByText("Free plan")).toBeVisible();
  });

  it("names an unnamed centre plainly, and waits quietly while loading", () => {
    const { rerender } = render(<AppShell current="dashboard" centre={{ ...centre, name: null, plan: "pro" }}>x</AppShell>);
    expect(screen.getByText("Your centre")).toBeVisible();
    expect(screen.getByText("Pro plan")).toBeVisible();

    rerender(<AppShell current="dashboard" centre={null}>x</AppShell>);
    expect(screen.queryByText("Free plan")).not.toBeInTheDocument();
  });

  it("renders the page inside its main area", () => {
    render(<AppShell current="dashboard" centre={centre}><p>Page body</p></AppShell>);
    expect(within(screen.getByRole("main")).getByText("Page body")).toBeVisible();
  });

  it("logs out and returns to the login page", async () => {
    setAccessToken("token");
    render(<AppShell current="dashboard" centre={centre}>content</AppShell>);

    await userEvent.setup().click(screen.getByRole("button", { name: "Log out" }));

    expect(logout).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("still logs out locally if the API can't be reached", async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error("offline"));
    setAccessToken("token");
    render(<AppShell current="dashboard" centre={centre}>content</AppShell>);

    await userEvent.setup().click(screen.getByRole("button", { name: "Log out" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getAccessToken()).toBeNull();
  });
});
