import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getPublicInvoice, startCheckout, type PublicInvoice } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import PayPage from "./page";

let search = new URLSearchParams({ t: "a".repeat(32) });
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicInvoice: vi.fn(),
  startCheckout: vi.fn(),
}));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn() }));

const due: PublicInvoice = {
  centre: { name: "Sunrise Classes" },
  invoice: {
    number: 12,
    studentName: "Aarav Sharma",
    batchName: "Class 10 Maths",
    cycle: "monthly",
    periodStart: "2026-11-01",
    dueDate: "2026-11-05",
    totalPaise: 260000,
    lateFeePaise: 10000,
    status: "overdue",
  },
  upi: { upiId: "sunrise@okicici", payeeName: "Sunrise Classes", link: "upi://pay?pa=sunrise%40okicici&am=2600.00" },
  receiptUrl: null,
  card: false,
};

beforeEach(() => {
  search = new URLSearchParams({ t: "a".repeat(32) });
  vi.mocked(getPublicInvoice).mockReset().mockResolvedValue(due);
});

describe("/pay", () => {
  it("shows the parent the bill and pays the centre directly by UPI", async () => {
    render(<PayPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Sunrise Classes" })).toBeInTheDocument();
    expect(getPublicInvoice).toHaveBeenCalledWith("a".repeat(32));
    expect(screen.getByText("Bill #12 · Aarav Sharma · Class 10 Maths · Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("₹2,600")).toBeInTheDocument();
    expect(screen.getByText("Includes ₹100 late fee")).toBeInTheDocument();
    expect(screen.getByText("Overdue since 5 Nov 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay ₹2,600 with UPI" })).toHaveAttribute("href", due.upi!.link);
    expect(await screen.findByRole("img", { name: "UPI QR code for ₹2,600" })).toBeInTheDocument();
    expect(screen.getByText(/sunrise@okicici/)).toBeInTheDocument();
  });

  it("offers the receipt once the bill is paid", async () => {
    vi.mocked(getPublicInvoice).mockResolvedValue({
      ...due,
      invoice: { ...due.invoice, status: "paid" },
      upi: null,
      receiptUrl: `/api/v1/public/receipts/${"a".repeat(32)}`,
    });
    render(<PayPage />);

    expect(await screen.findByText("Paid. Thank you!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download receipt" })).toHaveAttribute(
      "href",
      `http://localhost:8787/api/v1/public/receipts/${"a".repeat(32)}`,
    );
    expect(screen.queryByRole("link", { name: /with UPI/ })).not.toBeInTheDocument();
  });

  it("asks the parent to check with the centre when it takes no UPI", async () => {
    vi.mocked(getPublicInvoice).mockResolvedValue({ ...due, invoice: { ...due.invoice, status: "pending" }, upi: null });
    render(<PayPage />);
    expect(await screen.findByText("Due on 5 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Ask Sunrise Classes how to pay.")).toBeInTheDocument();
  });

  it("says when the link isn't valid", async () => {
    vi.mocked(getPublicInvoice).mockRejectedValue(new ApiRequestError(404, "not_found", "This link isn't valid. Ask the centre for a new one."));
    render(<PayPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link isn't valid. Ask the centre for a new one.");
  });

  it("says so at once when there's no token", async () => {
    search = new URLSearchParams();
    render(<PayPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link isn't valid. Ask the centre for a new one.");
    expect(getPublicInvoice).not.toHaveBeenCalled();
  });

  it("sends the parent to the centre's own Razorpay checkout for cards and net banking", async () => {
    vi.mocked(getPublicInvoice).mockResolvedValue({ ...due, card: true });
    vi.mocked(startCheckout).mockResolvedValue({ url: "https://rzp.io/i/abc" });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<PayPage />);

    await user.click(await screen.findByRole("button", { name: "Pay by card, UPI or net banking" }));

    expect(startCheckout).toHaveBeenCalledWith("a".repeat(32));
    expect(navigate).toHaveBeenCalledWith("https://rzp.io/i/abc");
  });
});
