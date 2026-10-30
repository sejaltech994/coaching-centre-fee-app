import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAbsenceAlerts, listBatches } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import AttendancePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBatches: vi.fn(),
  getAbsenceAlerts: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: { id: "c1", name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" } });
  vi.mocked(listBatches).mockResolvedValue({ batches: [], nextCursor: null });
  vi.mocked(getAbsenceAlerts).mockResolvedValue({ on: false });
});

describe("/attendance", () => {
  it("sits in the app shell with Attendance current", async () => {
    render(<AttendancePage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Attendance" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Attendance" })).toHaveAttribute("aria-current", "page");
  });
});
