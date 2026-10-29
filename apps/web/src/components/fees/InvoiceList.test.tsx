import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, listInvoices, receiptPdf, recordPayment, waiveInvoice, type Invoice } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { InvoiceList } from "./InvoiceList";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listInvoices: vi.fn(),
  waiveInvoice: vi.fn(),
  recordPayment: vi.fn(),
  receiptPdf: vi.fn(),
}));

const bill = (number: number, extra: Partial<Invoice> = {}): Invoice => ({
  id: `i${number}`,
  number,
  student: { id: "s1", name: "Aarav Sharma", parentName: "Neha Sharma" },
  batch: { id: "b1", name: "Class 10 Maths" },
  cycle: "monthly",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  dueDate: "2026-11-05",
  amountPaise: 250000,
  discountPaise: 0,
  lateFeePaise: 0,
  totalPaise: 250000,
  status: "pending",
  paidAt: null,
  waivedAt: null,
  waiveReason: null,
  payment: null,
  payLink: `http://localhost:3000/pay/?t=${"a".repeat(31)}${number}`,
  createdAt: "2026-11-02T04:30:00.000Z",
  ...extra,
});

beforeEach(() => {
  vi.mocked(listInvoices)
    .mockReset()
    .mockResolvedValue({
      invoices: [
        bill(2, { status: "overdue", lateFeePaise: 10000, totalPaise: 260000, dueDate: "2026-10-05", periodStart: "2026-10-01" }),
        bill(1),
      ],
      nextCursor: null,
    });
  vi.mocked(waiveInvoice).mockReset();
  vi.mocked(recordPayment).mockReset();
  vi.mocked(receiptPdf).mockReset();
});

const paidBill = bill(1, {
  status: "paid",
  paidAt: "2026-11-02T04:30:00.000Z",
  payment: { method: "upi", amountPaise: 250000, reference: "412345678901", receivedAt: "2026-11-02T04:30:00.000Z", receipt: { id: "r1", number: 1 } },
});

function setup(props: { studentId?: string } = {}) {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <InvoiceList token="token" {...props} />
    </ThemeRegistry>,
  );
  return { user };
}

const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("InvoiceList", () => {
  it("lists unpaid bills: student, batch, period, due date, amount and status", async () => {
    setup();

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith("token", { status: "unpaid" });
    const [overdue, pending] = rows();
    expect(overdue).toHaveTextContent("#2");
    expect(overdue).toHaveTextContent("Aarav Sharma");
    expect(overdue).toHaveTextContent("Class 10 Maths");
    expect(overdue).toHaveTextContent("Oct 2026");
    expect(overdue).toHaveTextContent("5 Oct 2026");
    expect(overdue).toHaveTextContent("₹2,600");
    expect(overdue).toHaveTextContent("Includes ₹100 late fee");
    expect(overdue).toHaveTextContent("Overdue");
    expect(pending).toHaveTextContent("Pending");
    expect(within(pending).getByRole("link", { name: "Aarav Sharma" })).toHaveAttribute("href", "/students/edit?id=s1");
  });

  it("filters by status and due month", async () => {
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Paid" }));
    expect(listInvoices).toHaveBeenLastCalledWith("token", { status: "paid" });

    await user.type(screen.getByLabelText("Due in"), "2026-11");
    expect(listInvoices).toHaveBeenLastCalledWith("token", { status: "paid", month: "2026-11" });
  });

  it("says when there are no bills to show", async () => {
    vi.mocked(listInvoices).mockResolvedValue({ invoices: [], nextCursor: null });
    setup();
    expect(await screen.findByText(/No unpaid bills\./)).toBeInTheDocument();
  });

  it("shows one student's bills without filters or the student column", async () => {
    setup({ studentId: "s1" });

    await screen.findByRole("table");
    expect(listInvoices).toHaveBeenCalledWith("token", { status: "all", studentId: "s1" });
    expect(screen.queryByRole("button", { name: "Paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Student" })).not.toBeInTheDocument();
  });

  it("waives a bill with a reason", async () => {
    vi.mocked(waiveInvoice).mockResolvedValue({ invoice: bill(1, { status: "waived", waiveReason: "Scholarship" }) });
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Waive bill #1" }));
    const dialog = screen.getByRole("dialog", { name: "Waive bill #1?" });
    expect(dialog).toHaveTextContent("Aarav Sharma won’t be asked to pay ₹2,500 for Nov 2026.");
    await user.click(within(dialog).getByRole("button", { name: "Waive fee" }));
    expect(within(dialog).getByLabelText("Reason")).toHaveAccessibleDescription("Say why the fee is waived.");
    expect(waiveInvoice).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason"), "Scholarship");
    await user.click(within(dialog).getByRole("button", { name: "Waive fee" }));

    expect(waiveInvoice).toHaveBeenCalledWith("token", "i1", "Scholarship");
    expect(await screen.findByText("Bill waived.")).toBeInTheDocument();
    expect(rows()[1]).toHaveTextContent("Waived");
    expect(screen.queryByRole("button", { name: "Waive bill #1" })).not.toBeInTheDocument();
  });

  it("explains when a bill can't be waived", async () => {
    vi.mocked(waiveInvoice).mockRejectedValue(new ApiRequestError(409, "invoice_closed", "This bill is already paid or waived."));
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Waive bill #1" }));
    await user.type(screen.getByLabelText("Reason"), "Scholarship");
    await user.click(screen.getByRole("button", { name: "Waive fee" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("This bill is already paid or waived.");
  });

  it("loads more bills on request", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce({ invoices: [bill(2)], nextCursor: "next" })
      .mockResolvedValueOnce({ invoices: [bill(1)], nextCursor: null });
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(listInvoices).toHaveBeenLastCalledWith("token", { status: "unpaid", cursor: "next" });
    expect(await screen.findByText("#1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("says when the bills can't be loaded", async () => {
    vi.mocked(listInvoices).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });

  it("records a payment, by UPI with its reference, and says which receipt it got", async () => {
    vi.mocked(recordPayment).mockResolvedValue({ invoice: paidBill });
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Record payment for bill #1" }));
    const dialog = screen.getByRole("dialog", { name: "Record payment for bill #1" });
    expect(dialog).toHaveTextContent("Aarav Sharma paid ₹2,500 for Nov 2026.");
    await user.click(within(dialog).getByRole("button", { name: "UPI" }));
    await user.type(within(dialog).getByLabelText("Reference (optional)"), "412345678901");
    await user.click(within(dialog).getByRole("button", { name: "Record payment" }));

    expect(recordPayment).toHaveBeenCalledWith("token", "i1", expect.objectContaining({ method: "upi", reference: "412345678901" }));
    expect(await screen.findByText("Payment recorded. Receipt #1.")).toBeInTheDocument();
    expect(rows()[1]).toHaveTextContent("Paid");
    expect(screen.queryByRole("button", { name: "Record payment for bill #1" })).not.toBeInTheDocument();
  });

  it("explains a payment that can't be recorded", async () => {
    vi.mocked(recordPayment).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { receivedOn: "The payment can’t be received in the future." } }),
    );
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Record payment for bill #1" }));
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(await screen.findByLabelText("Received on")).toHaveAccessibleDescription("The payment can’t be received in the future.");
  });

  it("opens a paid bill's receipt", async () => {
    vi.mocked(listInvoices).mockResolvedValue({ invoices: [paidBill], nextCursor: null });
    vi.mocked(receiptPdf).mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
    const createObjectURL = vi.fn(() => "blob:receipt");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Receipt #1" }));

    expect(receiptPdf).toHaveBeenCalledWith("token", "r1");
    expect(open).toHaveBeenCalledWith("blob:receipt", "_blank", "noopener");
    vi.unstubAllGlobals();
  });

  it("copies an unpaid bill's pay link, to send to the parent", async () => {
    const { user } = setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Copy pay link for bill #1" }));

    expect(writeText).toHaveBeenCalledWith(bill(1).payLink);
    expect(await screen.findByText("Pay link copied. Send it to the parent on WhatsApp.")).toBeInTheDocument();
  });
});
