import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FeePlan } from "@/lib/api";
import { BatchForm } from "./BatchForm";

const MONTHLY: FeePlan = {
  id: "p1",
  name: "Class 10 monthly",
  amountPaise: 250000,
  cycle: "monthly",
  dueDay: 5,
  lateFeePaise: null,
  lateFeeAfterDays: null,
  isActive: true,
};

function setup(props: Partial<Parameters<typeof BatchForm>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<BatchForm submitLabel="Create batch" onSave={onSave} {...props} />);
  return { user: userEvent.setup(), onSave };
}

const day = (name: string) => screen.getByRole("button", { name });

async function fill(user: ReturnType<typeof userEvent.setup>, f: { name?: string; subject?: string; days?: string[]; start?: string; end?: string }) {
  if (f.name) await user.type(screen.getByLabelText("Batch name"), f.name);
  if (f.subject) await user.type(screen.getByLabelText("Subject (optional)"), f.subject);
  for (const d of f.days ?? []) await user.click(day(d));
  // Time inputs take whole values (as a picker sets them); typed fragments aren't valid times.
  if (f.start) fireEvent.change(screen.getByLabelText("Starts"), { target: { value: f.start } });
  if (f.end) fireEvent.change(screen.getByLabelText("Ends"), { target: { value: f.end } });
}

describe("BatchForm", () => {
  it("offers the design's defaults: no days yet, 5:00 to 6:30 pm", () => {
    setup();
    for (const name of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(day(name)).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByLabelText("Starts")).toHaveValue("17:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("18:30");
  });

  it("toggles class days on and off", async () => {
    const { user } = setup();
    await user.click(day("Monday"));
    expect(day("Monday")).toHaveAttribute("aria-pressed", "true");
    await user.click(day("Monday"));
    expect(day("Monday")).toHaveAttribute("aria-pressed", "false");
  });

  it("saves a batch with its days in week order", async () => {
    const { user, onSave } = setup();

    await fill(user, { name: "Class 10 Maths", subject: "Mathematics", days: ["Friday", "Monday"], start: "16:00", end: "17:30" });
    await user.click(screen.getByRole("button", { name: "Create batch" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "Class 10 Maths",
      subject: "Mathematics",
      days: ["mon", "fri"],
      startTime: "16:00",
      endTime: "17:30",
      feePlanId: null,
    });
  });

  it("bills the batch's students on the fee plan picked", async () => {
    const { user, onSave } = setup({ feePlans: [MONTHLY] });
    const plan = screen.getByLabelText("Fee plan");
    expect([...(plan as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      "No fee plan yet",
      "Class 10 monthly — Monthly · ₹2,500 · due on the 5th",
    ]);
    expect(plan).toHaveAccessibleDescription("Students added here are billed on this plan. You can give a discount per student.");
    expect(screen.getByRole("link", { name: "Manage fee plans" })).toHaveAttribute("href", "/fee-plans");

    await fill(user, { name: "Class 10 Maths", days: ["Monday"] });
    await user.selectOptions(plan, "p1");
    await user.click(screen.getByRole("button", { name: "Create batch" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ feePlanId: "p1" }));
  });

  it.each([
    [{ days: ["Monday"] }, "Give the batch a name."],
    [{ name: "Yoga" }, "Pick at least one day."],
    [{ name: "Yoga", days: ["Monday"], start: "17:00", end: "16:00" }, "The batch must end after it starts."],
  ])("explains what is missing instead of saving (%#)", async (input, message) => {
    const { user, onSave } = setup();

    await fill(user, input);
    await user.click(screen.getByRole("button", { name: "Create batch" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("starts from the batch being edited", () => {
    setup({
      submitLabel: "Save changes",
      initial: { name: "Class 8 Science", subject: null, days: ["tue", "thu"], startTime: "16:00", endTime: "17:00", feePlanId: "p1" },
      feePlans: [MONTHLY],
    });

    expect(screen.getByLabelText("Fee plan")).toHaveValue("p1");

    expect(screen.getByLabelText("Batch name")).toHaveValue("Class 8 Science");
    expect(day("Tuesday")).toHaveAttribute("aria-pressed", "true");
    expect(day("Monday")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Starts")).toHaveValue("16:00");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
  });

  it("shows why the server refused to save", async () => {
    const { user } = setup({ onSave: vi.fn().mockRejectedValue(new Error("You already have a batch called “Yoga”.")) });

    await fill(user, { name: "Yoga", days: ["Monday"] });
    await user.click(screen.getByRole("button", { name: "Create batch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a batch called “Yoga”.");
  });
});
