import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBatch, listInvoices, listStudents } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import ViewBatchPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams({ id: "b1" }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBatch: vi.fn(),
  listStudents: vi.fn(),
  listInvoices: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: { id: "c1", name: "Sunrise Classes", plan: "free", timezone: "Asia/Kolkata" } });
  vi.mocked(getBatch).mockResolvedValue({ id: "b1", name: "Class 10 Maths", subject: null, days: ["mon"], startTime: "16:00", endTime: "17:00", isActive: true, feePlan: null, createdAt: "" });
  vi.mocked(listStudents).mockResolvedValue({ students: [], nextCursor: null });
  vi.mocked(listInvoices).mockResolvedValue({ invoices: [], nextCursor: null });
});

describe("/batches/view", () => {
  it("shows the batch named in the address, under Batches", async () => {
    render(<ViewBatchPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Class 10 Maths" })).toBeInTheDocument();
    expect(getBatch).toHaveBeenCalledWith("token", "b1");
    expect(screen.getByRole("link", { name: "Batches" })).toHaveAttribute("aria-current", "page");
  });
});
