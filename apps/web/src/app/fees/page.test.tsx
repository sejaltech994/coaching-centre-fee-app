import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listInvoices } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import FeesPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listInvoices: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: { id: "c1", name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" } });
  vi.mocked(listInvoices).mockResolvedValue({ invoices: [], nextCursor: null });
});

describe("/fees", () => {
  it("sits in the app shell with Fees current, listing unpaid bills", async () => {
    render(<FeesPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Fees" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Fees" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText(/No unpaid bills\./)).toBeInTheDocument();
  });
});
