import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { StudentForm } from "./StudentForm";

const BATCHES = [
  { id: "b1", name: "Class 10 Maths" },
  { id: "b2", name: "Class 10 Science" },
];

function setup(props: Partial<Parameters<typeof StudentForm>[0]> = {}) {
  const onSubmit = vi.fn(async () => {});
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <StudentForm submitLabel="Add student" onSubmit={onSubmit} onCancel={onCancel} {...props} />
    </ThemeRegistry>,
  );
  return { user, onSubmit, onCancel };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Student’s name"), "Aarav Sharma");
  await user.type(screen.getByLabelText("Parent’s name"), "Neha Sharma");
  await user.type(screen.getByLabelText("Parent’s mobile number"), "98765 43210");
}

describe("StudentForm", () => {
  it("adds a student with the parent's consent and the batches picked", async () => {
    const { user, onSubmit } = setup({ batches: BATCHES });
    await fillIn(user);
    await user.click(screen.getByRole("checkbox", { name: /agreed to receive fee reminders on WhatsApp/ }));
    await user.click(screen.getByRole("checkbox", { name: "Class 10 Science" }));

    await user.click(screen.getByRole("button", { name: "Add student" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Aarav Sharma",
      parentName: "Neha Sharma",
      parentPhone: "98765 43210",
      whatsappOptIn: true,
      batchIds: ["b2"],
    });
  });

  it("says where reminders go, and what to do when there are no batches yet", () => {
    setup({ batches: [] });
    expect(screen.getByLabelText("Parent’s mobile number")).toHaveAccessibleDescription(
      "Fee reminders and receipts go to this number.",
    );
    expect(screen.getByText("Create a batch first to add students to it.")).toBeInTheDocument();
  });

  it("edits a student's details without a batch picker", async () => {
    const { user, onSubmit } = setup({
      submitLabel: "Save",
      initial: { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "+919876543210", whatsappOptIn: true },
    });
    expect(screen.getByLabelText("Parent’s mobile number")).toHaveValue("98765 43210");
    expect(screen.queryByText("Batches")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Student’s name"));
    await user.type(screen.getByLabelText("Student’s name"), "Aarav S. Sharma");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Aarav S. Sharma",
      parentName: "Neha Sharma",
      parentPhone: "98765 43210",
      whatsappOptIn: true,
    });
  });

  it("names every field at fault before sending, moving to the first", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText("Parent’s mobile number"), "123");
    await user.click(screen.getByRole("button", { name: "Add student" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Student’s name")).toHaveAccessibleDescription("Enter the student’s name.");
    expect(screen.getByLabelText("Parent’s name")).toHaveAccessibleDescription("Enter the parent’s name.");
    expect(screen.getByLabelText("Parent’s mobile number")).toHaveAccessibleDescription("Enter a 10-digit Indian mobile number.");
    expect(screen.getByLabelText("Student’s name")).toHaveFocus();
  });

  it("shows the server's message for a field, or for the whole form", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(400, "invalid_request", "x", { fields: { batchIds: "Pick from your active batches." } }))
      .mockRejectedValueOnce(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup({ batches: BATCHES, onSubmit });
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Add student" }));
    expect(await screen.findByText("Pick from your active batches.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add student" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });

  it("can be cancelled", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
