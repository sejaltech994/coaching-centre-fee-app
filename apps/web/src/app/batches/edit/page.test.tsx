import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, archiveBatch, getBatch, listFeePlans, updateBatch, type Batch, type FeePlan } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import EditBatchPage from "./page";

const push = vi.fn();
let search = new URLSearchParams({ id: "b1" });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), useSearchParams: () => search }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBatch: vi.fn(),
  updateBatch: vi.fn(),
  archiveBatch: vi.fn(),
  listFeePlans: vi.fn(),
}));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };
const batch = (over: Partial<Batch> = {}): Batch => ({
  id: "b1",
  name: "Class 8 Science",
  subject: null,
  days: ["tue", "thu"],
  startTime: "16:00",
  endTime: "17:00",
  isActive: true,
  feePlan: null,
  createdAt: "2026-11-02T04:30:00.000Z",
  ...over,
});
const MONTHLY: FeePlan = {
  id: "p1",
  name: "Class 8 monthly",
  amountPaise: 200000,
  cycle: "monthly",
  dueDay: 5,
  lateFeePaise: null,
  lateFeeAfterDays: null,
  isActive: true,
};

beforeEach(() => {
  push.mockReset();
  search = new URLSearchParams({ id: "b1" });
  vi.mocked(useSession).mockReturnValue({ token: "token", centre });
  vi.mocked(getBatch).mockReset().mockResolvedValue(batch());
  vi.mocked(updateBatch).mockReset().mockResolvedValue(batch());
  vi.mocked(archiveBatch).mockReset().mockResolvedValue(batch({ isActive: false }));
  vi.mocked(listFeePlans).mockResolvedValue({ feePlans: [MONTHLY] });
});

describe("/batches/edit", () => {
  it("loads the batch into the form", async () => {
    render(<EditBatchPage />);

    expect(await screen.findByLabelText("Batch name")).toHaveValue("Class 8 Science");
    expect(screen.getByRole("heading", { name: "Edit batch", level: 1 })).toBeVisible();
    expect(getBatch).toHaveBeenCalledWith("token", "b1");
  });

  it("saves changes and returns to the list", async () => {
    const user = userEvent.setup();
    render(<EditBatchPage />);

    fireEvent.change(await screen.findByLabelText("Starts"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "18:00" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateBatch).toHaveBeenCalledWith("token", "b1", {
      name: "Class 8 Science",
      subject: null,
      days: ["tue", "thu"],
      startTime: "17:00",
      endTime: "18:00",
      feePlanId: null,
    });
    expect(push).toHaveBeenCalledWith("/batches");
  });

  it("changes the batch's fee plan", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce(batch({ feePlan: MONTHLY }));
    const user = userEvent.setup();
    render(<EditBatchPage />);

    expect(await screen.findByLabelText("Fee plan")).toHaveValue("p1");
    await user.selectOptions(screen.getByLabelText("Fee plan"), "");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateBatch).toHaveBeenCalledWith("token", "b1", expect.objectContaining({ feePlanId: null }));
  });

  it("archives the batch", async () => {
    const user = userEvent.setup();
    render(<EditBatchPage />);

    await user.click(await screen.findByRole("button", { name: "Archive batch" }));

    expect(archiveBatch).toHaveBeenCalledWith("token", "b1");
    expect(push).toHaveBeenCalledWith("/batches");
  });

  it("restores an archived batch", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce(batch({ isActive: false }));
    const user = userEvent.setup();
    render(<EditBatchPage />);

    expect(await screen.findByText("This batch is archived.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restore batch" }));

    expect(updateBatch).toHaveBeenCalledWith("token", "b1", { isActive: true });
    expect(push).toHaveBeenCalledWith("/batches");
  });

  it.each([
    ["an unknown batch", () => vi.mocked(getBatch).mockRejectedValueOnce(new ApiRequestError(404, "not_found", "No such batch."))],
    ["no id", () => (search = new URLSearchParams())],
  ])("explains %s, with a way back", async (_label, arrange) => {
    arrange();
    render(<EditBatchPage />);

    expect(await screen.findByText("We couldn't find that batch.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to batches" })).toHaveAttribute("href", "/batches");
  });
});
