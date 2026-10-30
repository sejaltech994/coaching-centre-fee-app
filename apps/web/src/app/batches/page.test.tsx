import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBatches, type Batch } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import BatchesPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBatches: vi.fn(),
}));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };
const batch = (over: Partial<Batch> = {}): Batch => ({
  id: "b1",
  name: "Class 10 Maths",
  subject: "Mathematics",
  days: ["mon", "wed", "fri"],
  startTime: "16:00",
  endTime: "17:30",
  isActive: true,
  feePlan: null,
  createdAt: "2026-11-02T04:30:00.000Z",
  ...over,
});
const row = (name: string) => screen.getByRole("link", { name }).closest("tr")!;

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ token: "token", centre });
  vi.mocked(listBatches).mockReset().mockResolvedValue({ batches: [], nextCursor: null });
});

describe("/batches", () => {
  it("waits for the session before loading", () => {
    vi.mocked(useSession).mockReturnValue({ token: null, centre: null });
    render(<BatchesPage />);
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("says there are no batches yet, with a way to add one", async () => {
    render(<BatchesPage />);

    expect(await screen.findByText("No batches yet. Add your first batch to start enrolling students.")).toBeVisible();
    expect(screen.getByRole("link", { name: "New batch" })).toHaveAttribute("href", "/batches/new");
    expect(listBatches).toHaveBeenCalledWith("token", { status: "all" });
  });

  it("shows each batch's name, subject, days and time, linking to it", async () => {
    vi.mocked(listBatches).mockResolvedValueOnce({ batches: [batch()], nextCursor: null });
    render(<BatchesPage />);

    const link = await screen.findByRole("link", { name: "Class 10 Maths" });
    expect(link).toHaveAttribute("href", "/batches/view?id=b1");
    const cells = within(row("Class 10 Maths"));
    expect(cells.getByText("Mathematics")).toBeVisible();
    expect(cells.getByText("Mon · Wed · Fri")).toBeVisible();
    expect(cells.getByText("4:00–5:30 pm")).toBeVisible();
  });

  it("shows each batch's fee plan, and links to the fee plans", async () => {
    const feePlan = { id: "p1", name: "Monthly", amountPaise: 250000, cycle: "monthly" as const, dueDay: 5, lateFeePaise: null, lateFeeAfterDays: null, isActive: true };
    vi.mocked(listBatches).mockResolvedValueOnce({ batches: [batch({ feePlan })], nextCursor: null });
    render(<BatchesPage />);

    await screen.findByRole("link", { name: "Class 10 Maths" });
    expect(within(row("Class 10 Maths")).getByText("Monthly · ₹2,500 · due on the 5th")).toBeVisible();
    expect(screen.getByRole("link", { name: "Fee plans" })).toHaveAttribute("href", "/fee-plans");
  });

  it("switches between active and archived batches, with counts", async () => {
    vi.mocked(listBatches).mockResolvedValueOnce({
      batches: [batch(), batch({ id: "b2", name: "Summer camp", isActive: false })],
      nextCursor: null,
    });
    const user = userEvent.setup();
    render(<BatchesPage />);

    const active = await screen.findByRole("button", { name: "Active · 1" });
    const archived = screen.getByRole("button", { name: "Archived · 1" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("link", { name: "Summer camp" })).not.toBeInTheDocument();

    await user.click(archived);

    expect(archived).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Summer camp" })).toBeVisible();
    expect(within(row("Summer camp")).getByText("Archived")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Class 10 Maths" })).not.toBeInTheDocument();
  });

  it("filters by name or subject as the owner types", async () => {
    vi.mocked(listBatches).mockResolvedValueOnce({
      batches: [batch(), batch({ id: "b2", name: "Kathak juniors", subject: "Dance" })],
      nextCursor: null,
    });
    const user = userEvent.setup();
    render(<BatchesPage />);

    await user.type(await screen.findByLabelText("Search batches"), "dance");

    expect(screen.getByRole("link", { name: "Kathak juniors" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Class 10 Maths" })).not.toBeInTheDocument();
  });

  it("says when a search matches nothing", async () => {
    vi.mocked(listBatches).mockResolvedValueOnce({ batches: [batch()], nextCursor: null });
    const user = userEvent.setup();
    render(<BatchesPage />);

    await user.type(await screen.findByLabelText("Search batches"), "zzz");

    expect(screen.getByText("No batches match “zzz”.")).toBeVisible();
  });

  it("says when the batches couldn't be loaded, instead of showing an empty list, and can retry", async () => {
    vi.mocked(listBatches)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ batches: [batch()], nextCursor: null });
    const user = userEvent.setup();
    render(<BatchesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your batches.");
    expect(screen.queryByText(/No batches yet/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("link", { name: "Class 10 Maths" })).toBeVisible();
    expect(listBatches).toHaveBeenCalledTimes(2);
  });

  it("shows the active count in the heading area", async () => {
    vi.mocked(listBatches).mockResolvedValueOnce({ batches: [batch(), batch({ id: "b2", name: "B" })], nextCursor: null });
    render(<BatchesPage />);
    expect(await screen.findByText("2 active")).toBeVisible();
  });
});
