import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, createBatch } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import NewBatchPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createBatch: vi.fn(),
}));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));

const centre = { id: "c1", name: "Sunrise Classes", plan: "free" as const, timezone: "Asia/Kolkata" };

async function createYoga(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Batch name"), "Yoga");
  await user.click(screen.getByRole("button", { name: "Saturday" }));
  fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "07:00" } });
  fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "08:00" } });
  await user.click(screen.getByRole("button", { name: "Create batch" }));
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(useSession).mockReturnValue({ token: "token", centre });
  vi.mocked(createBatch).mockReset();
});

describe("/batches/new", () => {
  it("creates the batch and returns to the list", async () => {
    vi.mocked(createBatch).mockResolvedValueOnce({} as never);
    const user = userEvent.setup();
    render(<NewBatchPage />);

    expect(screen.getByRole("heading", { name: "New batch", level: 1 })).toBeVisible();
    await createYoga(user);

    expect(createBatch).toHaveBeenCalledWith("token", {
      name: "Yoga",
      subject: null,
      days: ["sat"],
      startTime: "07:00",
      endTime: "08:00",
    });
    expect(push).toHaveBeenCalledWith("/batches");
  });

  it("shows why the batch couldn't be created and stays on the form", async () => {
    vi.mocked(createBatch).mockRejectedValueOnce(
      new ApiRequestError(409, "batch_name_taken", "You already have a batch called “yoga”."),
    );
    const user = userEvent.setup();
    render(<NewBatchPage />);

    await createYoga(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a batch called “yoga”.");
    expect(push).not.toHaveBeenCalled();
  });

  it("can be closed without saving", () => {
    render(<NewBatchPage />);
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/batches");
  });
});
