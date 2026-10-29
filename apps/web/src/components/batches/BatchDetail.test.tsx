import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBatch, listInvoices, listStudents, type Batch, type StudentSummary } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { BatchDetail } from "./BatchDetail";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBatch: vi.fn(),
  listStudents: vi.fn(),
  listInvoices: vi.fn(),
}));

const batch: Batch = {
  id: "b1",
  name: "Class 10 Maths",
  subject: "Maths",
  days: ["mon", "wed"],
  startTime: "16:00",
  endTime: "17:00",
  isActive: true,
  feePlan: { id: "p1", name: "Monthly", amountPaise: 250000, cycle: "monthly", dueDay: 5, lateFeePaise: null, lateFeeAfterDays: null, isActive: true },
  createdAt: "",
};

const aarav: StudentSummary = {
  id: "s1",
  name: "Aarav Sharma",
  parentName: "Neha Sharma",
  parentPhone: "+919876543210",
  whatsappOptIn: true,
  status: "active",
  batches: [{ id: "b1", name: "Class 10 Maths", enrolmentId: "e1", since: "2026-11-02", feePlan: null, discountPaise: 0 }],
};

beforeEach(() => {
  vi.mocked(getBatch).mockReset().mockResolvedValue(batch);
  vi.mocked(listStudents).mockReset().mockResolvedValue({ students: [aarav], nextCursor: null });
  vi.mocked(listInvoices).mockReset().mockResolvedValue({ invoices: [], nextCursor: null });
});

const setup = (id = "b1") =>
  render(
    <ThemeRegistry>
      <BatchDetail token="token" id={id} />
    </ThemeRegistry>,
  );

describe("BatchDetail", () => {
  it("shows the batch: its schedule and fee plan, with a way to edit it", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 1, name: "Class 10 Maths" })).toBeInTheDocument();
    expect(screen.getByText("Maths · Mon · Wed · 4:00–5:00 pm")).toBeInTheDocument();
    expect(screen.getByText("Monthly · ₹2,500 · due on the 5th")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit batch" })).toHaveAttribute("href", "/batches/edit?id=b1");
  });

  it("lists the students in it now, and since when", async () => {
    setup();
    const students = await screen.findByRole("region", { name: "Students" });
    expect(listStudents).toHaveBeenCalledWith("token", { status: "active", batchId: "b1" });
    const [row] = within(students).getAllByRole("row").slice(1);
    expect(within(row!).getByRole("link", { name: "Aarav Sharma" })).toHaveAttribute("href", "/students/edit?id=s1");
    expect(row).toHaveTextContent("Neha Sharma");
    expect(row).toHaveTextContent("2 Nov 2026");
  });

  it("lists the batch's bills", async () => {
    setup();
    expect(await screen.findByRole("region", { name: "Fees" })).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith("token", { status: "unpaid", batchId: "b1" });
  });

  it("says when the batch has no students yet", async () => {
    vi.mocked(listStudents).mockResolvedValue({ students: [], nextCursor: null });
    setup();
    expect(await screen.findByText("No students in this batch yet.")).toBeInTheDocument();
  });

  it("says when there's no such batch", async () => {
    vi.mocked(getBatch).mockRejectedValue(new Error("404"));
    setup();
    expect(await screen.findByText("We couldn't find that batch.")).toBeInTheDocument();
  });
});
