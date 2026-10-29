import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, createFeePlan, listFeePlans, updateFeePlan, type FeePlan } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { FeePlans } from "./FeePlans";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listFeePlans: vi.fn(),
  createFeePlan: vi.fn(),
  updateFeePlan: vi.fn(),
}));

const monthly: FeePlan = {
  id: "p1",
  name: "Class 10 monthly",
  amountPaise: 250000,
  cycle: "monthly",
  dueDay: 5,
  lateFeePaise: 10000,
  lateFeeAfterDays: 7,
  isActive: true,
};
const oldPlan: FeePlan = { ...monthly, id: "p2", name: "Old plan", lateFeePaise: null, lateFeeAfterDays: null, isActive: false };

beforeEach(() => {
  vi.mocked(listFeePlans).mockReset().mockResolvedValue({ feePlans: [monthly, oldPlan] });
  vi.mocked(createFeePlan).mockReset();
  vi.mocked(updateFeePlan).mockReset();
});

function setup() {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <FeePlans token="token" />
    </ThemeRegistry>,
  );
  return { user };
}


describe("FeePlans", () => {
  it("lists the plans with what they charge and when, archived ones apart", async () => {
    setup();

    expect(await screen.findByRole("listitem", { name: "Class 10 monthly" })).toHaveTextContent(
      "Monthly · ₹2,500 · due on the 5thLate fee ₹100 after 7 days",
    );
    expect(listFeePlans).toHaveBeenCalledWith("token", { status: "all" });
    const archived = screen.getByRole("region", { name: "Archived" });
    expect(within(archived).getByRole("listitem", { name: "Old plan" })).toHaveTextContent("No late fee");
  });

  it("adds a monthly plan with a late fee, in rupees", async () => {
    vi.mocked(createFeePlan).mockResolvedValue({ feePlan: { ...monthly, id: "p3", name: "Class 9 monthly" } });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New fee plan" }));
    const dialog = screen.getByRole("dialog", { name: "New fee plan" });

    await user.type(within(dialog).getByLabelText("Name"), "Class 9 monthly");
    await user.type(within(dialog).getByLabelText("Amount"), "2,500");
    await user.click(within(dialog).getByRole("button", { name: "Monthly" }));
    await user.click(within(dialog).getByLabelText("Due on day"));
    await user.click(await screen.findByRole("option", { name: "5" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Charge a late fee" }));
    await user.type(within(dialog).getByLabelText("Late fee"), "100");
    await user.type(within(dialog).getByLabelText("Days after the due date"), "7");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(createFeePlan).toHaveBeenCalledWith("token", {
      name: "Class 9 monthly",
      amountPaise: 250000,
      cycle: "monthly",
      dueDay: 5,
      lateFeePaise: 10000,
      lateFeeAfterDays: 7,
    });
    expect(await screen.findByRole("listitem", { name: "Class 9 monthly" })).toBeInTheDocument();
    expect(screen.getByText("Fee plan saved.")).toBeInTheDocument();
  });

  it("asks no due day for a one-time fee", async () => {
    vi.mocked(createFeePlan).mockResolvedValue({ feePlan: { ...monthly, id: "p4", cycle: "one_time", dueDay: null } });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New fee plan" }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByLabelText("Name"), "Admission");
    await user.type(within(dialog).getByLabelText("Amount"), "1000");
    await user.click(within(dialog).getByRole("button", { name: "One-time" }));
    expect(within(dialog).queryByLabelText("Due on day")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(createFeePlan).toHaveBeenCalledWith("token", expect.objectContaining({ cycle: "one_time", dueDay: null, amountPaise: 100000 }));
  });

  it("explains what's wrong before sending anything", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New fee plan" }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByLabelText("Amount"), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(createFeePlan).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Name")).toHaveAccessibleDescription("Enter a name for the plan.");
    expect(within(dialog).getByLabelText("Amount")).toHaveAccessibleDescription("Enter an amount of at least ₹1.");
    expect(within(dialog).getByText("Pick how often the fee is due.")).toBeInTheDocument();
  });

  it("edits a plan, starting from what it is", async () => {
    vi.mocked(updateFeePlan).mockResolvedValue({ feePlan: { ...monthly, amountPaise: 300000 } });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Class 10 monthly" }));
    const dialog = screen.getByRole("dialog", { name: "Edit fee plan" });
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("2500");
    expect(within(dialog).getByLabelText("Late fee")).toHaveValue("100");

    await user.clear(within(dialog).getByLabelText("Amount"));
    await user.type(within(dialog).getByLabelText("Amount"), "3000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(updateFeePlan).toHaveBeenCalledWith("token", "p1", expect.objectContaining({ amountPaise: 300000 }));
    expect(await screen.findByText("Monthly · ₹3,000 · due on the 5th")).toBeInTheDocument();
  });

  it("archives a plan and restores it", async () => {
    vi.mocked(updateFeePlan)
      .mockResolvedValueOnce({ feePlan: { ...monthly, isActive: false } })
      .mockResolvedValueOnce({ feePlan: { ...monthly, isActive: true } });
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Archive Class 10 monthly" }));
    expect(updateFeePlan).toHaveBeenCalledWith("token", "p1", { isActive: false });
    expect(await within(screen.getByRole("region", { name: "Archived" })).findByRole("listitem", { name: "Class 10 monthly" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore Class 10 monthly" }));
    expect(updateFeePlan).toHaveBeenLastCalledWith("token", "p1", { isActive: true });
    expect(await screen.findByRole("button", { name: "Archive Class 10 monthly" })).toBeInTheDocument();
  });

  it("shows the server's message for a field", async () => {
    vi.mocked(createFeePlan).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { lateFeePaise: "The late fee can’t be more than the fee." } }),
    );
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New fee plan" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Tiny");
    await user.type(within(dialog).getByLabelText("Amount"), "1");
    await user.click(within(dialog).getByRole("button", { name: "One-time" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Charge a late fee" }));
    await user.type(within(dialog).getByLabelText("Late fee"), "1");
    await user.type(within(dialog).getByLabelText("Days after the due date"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByLabelText("Late fee")).toHaveAccessibleDescription("The late fee can’t be more than the fee.");
  });

  it("invites the first plan when there are none", async () => {
    vi.mocked(listFeePlans).mockResolvedValue({ feePlans: [] });
    setup();
    expect(await screen.findByText("No fee plans yet. Add one, then pick it for a batch.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Archived" })).not.toBeInTheDocument();
  });

  it("says when the plans can't be loaded", async () => {
    vi.mocked(listFeePlans).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });
});

