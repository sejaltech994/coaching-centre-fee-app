import { render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  endEnrolment,
  enrol,
  getStudent,
  listBatches,
  listInvoices,
  setDiscount,
  updateStudent,
  type FeePlan,
  type StudentDetail as Detail,
} from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { StudentDetail } from "./StudentDetail";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStudent: vi.fn(),
  listBatches: vi.fn(),
  updateStudent: vi.fn(),
  enrol: vi.fn(),
  endEnrolment: vi.fn(),
  setDiscount: vi.fn(),
  listInvoices: vi.fn(),
}));

const monthly: FeePlan = {
  id: "p1",
  name: "Class 10 monthly",
  amountPaise: 250000,
  cycle: "monthly",
  dueDay: 5,
  lateFeePaise: null,
  lateFeeAfterDays: null,
  isActive: true,
};

const maths = { id: "b1", name: "Class 10 Maths" };
const science = { id: "b2", name: "Class 10 Science" };
const aarav: Detail = {
  id: "s1",
  name: "Aarav Sharma",
  parentName: "Neha Sharma",
  parentPhone: "+919876543210",
  whatsappOptIn: true,
  status: "active",
  batches: [{ ...maths, enrolmentId: "e1", since: "2026-11-02", feePlan: monthly, discountPaise: 0 }],
  enrolments: [{ id: "e1", batch: maths, startDate: "2026-11-02", endDate: null, discountPaise: 0 }],
};
const batchRow = (b: { id: string; name: string }, feePlan: FeePlan | null = null) => ({
  ...b,
  feePlan,
  subject: null,
  days: ["mon" as const],
  startTime: "16:00",
  endTime: "17:00",
  isActive: true,
  createdAt: "",
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-03T04:30:00Z") });
  vi.mocked(getStudent).mockReset().mockResolvedValue(aarav);
  vi.mocked(listBatches).mockReset().mockResolvedValue({ batches: [batchRow(maths, monthly), batchRow(science)], nextCursor: null });
  vi.mocked(updateStudent).mockReset();
  vi.mocked(listInvoices).mockReset().mockResolvedValue({ invoices: [], nextCursor: null });
  vi.mocked(enrol)
    .mockReset()
    .mockResolvedValue({ enrolment: { id: "e2", batch: science, startDate: "2026-11-03", endDate: null, discountPaise: 0 } });
  vi.mocked(endEnrolment)
    .mockReset()
    .mockResolvedValue({ enrolment: { id: "e1", batch: maths, startDate: "2026-11-02", endDate: "2026-11-03", discountPaise: 0 } });
  vi.mocked(setDiscount)
    .mockReset()
    .mockResolvedValue({ enrolment: { id: "e1", batch: maths, startDate: "2026-11-02", endDate: null, discountPaise: 25000 } });
  return () => vi.useRealTimers();
});

function setup() {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <StudentDetail token="token" id="s1" />
    </ThemeRegistry>,
  );
  return { user };
}

const batchesSection = () => screen.getByRole("region", { name: "Batches" });

describe("StudentDetail", () => {
  it("shows the student, their parent and their batches", async () => {
    setup();

    expect(await screen.findByRole("heading", { level: 1, name: "Aarav Sharma" })).toBeInTheDocument();
    expect(screen.getByLabelText("Parent’s name")).toHaveValue("Neha Sharma");
    expect(within(batchesSection()).getByRole("listitem")).toHaveTextContent(
      "Class 10 MathsSince 2 Nov 2026 · Monthly · ₹2,500 · due on the 5th · No discount",
    );
  });

  it("saves changed details", async () => {
    vi.mocked(updateStudent).mockResolvedValue({ student: { ...aarav, name: "Aarav S. Sharma" } });
    const { user } = setup();
    const name = await screen.findByLabelText("Student’s name");

    await user.clear(name);
    await user.type(name, "Aarav S. Sharma");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateStudent).toHaveBeenCalledWith("token", "s1", expect.objectContaining({ name: "Aarav S. Sharma" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Aarav S. Sharma" })).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("adds the student to another batch", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(within(batchesSection()).getByRole("combobox", { name: "Add to batch" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Class 10 Science"]);
    await user.click(options[0]!);
    await user.click(within(batchesSection()).getByRole("button", { name: "Add" }));

    expect(enrol).toHaveBeenCalledWith("token", "s1", "b2");
    expect(await screen.findByText("Added to Class 10 Science.")).toBeInTheDocument();
    expect(within(batchesSection()).getAllByRole("listitem")).toHaveLength(2);
    // Joining a batch with a fee plan makes a bill: the fees are loaded again.
    expect(listInvoices).toHaveBeenCalledTimes(2);
  });

  it("lists the student's bills", async () => {
    setup();
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByRole("region", { name: "Fees" })).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith("token", { status: "all", studentId: "s1" });
  });

  it("gives the student a discount on a batch's fee", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(within(batchesSection()).getByRole("button", { name: "Discount on Class 10 Maths" }));
    await user.type(within(batchesSection()).getByLabelText("Discount"), "250");
    await user.click(within(batchesSection()).getByRole("button", { name: "Save discount" }));

    expect(setDiscount).toHaveBeenCalledWith("token", "e1", 25000);
    expect(await within(batchesSection()).findByText(/₹250 off/)).toBeInTheDocument();
  });

  it("checks a discount before sending it", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(within(batchesSection()).getByRole("button", { name: "Discount on Class 10 Maths" }));
    await user.type(within(batchesSection()).getByLabelText("Discount"), "3,000");
    await user.click(within(batchesSection()).getByRole("button", { name: "Save discount" }));

    expect(setDiscount).not.toHaveBeenCalled();
    expect(within(batchesSection()).getByLabelText("Discount")).toHaveAccessibleDescription("The discount can’t be more than the fee.");
  });

  it("offers no discount on a batch without a fee plan", async () => {
    vi.mocked(getStudent).mockResolvedValue({ ...aarav, batches: [{ ...aarav.batches[0]!, feePlan: null }] });
    setup();
    await screen.findByRole("heading", { level: 1 });

    expect(within(batchesSection()).getByRole("listitem")).toHaveTextContent("No fee plan");
    expect(within(batchesSection()).queryByRole("button", { name: /Discount/ })).not.toBeInTheDocument();
  });

  it("takes the student out of a batch from today, in India", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(within(batchesSection()).getByRole("button", { name: "Remove from Class 10 Maths" }));

    expect(endEnrolment).toHaveBeenCalledWith("token", "e1", "2026-11-03");
    expect(await screen.findByText("Removed from Class 10 Maths.")).toBeInTheDocument();
    expect(within(batchesSection()).getByText("Not in any batch yet.")).toBeInTheDocument();
  });

  it("marks the student as left after asking, and back as active", async () => {
    vi.mocked(updateStudent)
      .mockResolvedValueOnce({ student: { ...aarav, status: "left", batches: [] } })
      .mockResolvedValueOnce({ student: { ...aarav, status: "active", batches: [] } });
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(screen.getByRole("button", { name: "Mark as left" }));
    const dialog = screen.getByRole("dialog", { name: "Mark Aarav Sharma as left?" });
    expect(dialog).toHaveTextContent("They’ll be taken out of their batches today. Their fee records stay.");
    await user.click(within(dialog).getByRole("button", { name: "Mark as left" }));

    expect(updateStudent).toHaveBeenCalledWith("token", "s1", { status: "left" });
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
    expect(await screen.findByText("Left the centre")).toBeInTheDocument();
    expect(within(batchesSection()).queryByRole("combobox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as active again" }));
    expect(updateStudent).toHaveBeenLastCalledWith("token", "s1", { status: "active" });
    expect(await within(batchesSection()).findByRole("combobox", { name: "Add to batch" })).toBeInTheDocument();
  });

  it("explains a batch change that fails", async () => {
    vi.mocked(enrol).mockRejectedValue(new ApiRequestError(409, "already_enrolled", "x"));
    const { user } = setup();
    await screen.findByRole("heading", { level: 1 });

    await user.click(within(batchesSection()).getByRole("combobox", { name: "Add to batch" }));
    await user.click(await screen.findByRole("option", { name: "Class 10 Science" }));
    await user.click(within(batchesSection()).getByRole("button", { name: "Add" }));

    expect(await within(batchesSection()).findByRole("alert")).toHaveTextContent("This student is already in that batch.");
  });

  it("says when the student can't be found", async () => {
    vi.mocked(getStudent).mockRejectedValue(new ApiRequestError(404, "not_found", "x"));
    setup();
    expect(await screen.findByText("We couldn’t find that student.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to students" })).toHaveAttribute("href", "/students");
  });
});
