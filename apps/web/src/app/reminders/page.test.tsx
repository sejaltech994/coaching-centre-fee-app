import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReminderTone, listReminders } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import RemindersPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listReminders: vi.fn(),
  getReminderTone: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: { id: "c1", name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" } });
  vi.mocked(listReminders).mockResolvedValue({ reminders: [], nextCursor: null });
  vi.mocked(getReminderTone).mockResolvedValue({ tone: "gentle" });
});

describe("/reminders", () => {
  it("sits in the app shell with Reminders current, explaining the schedule", async () => {
    render(<RemindersPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Reminders" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Reminders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/3 days before a fee is due/)).toBeInTheDocument();
  });
});
