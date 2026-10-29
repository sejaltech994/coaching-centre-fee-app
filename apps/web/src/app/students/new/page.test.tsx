import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStudent, listBatches } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import NewStudentPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }) }));
vi.mock("@/lib/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createStudent: vi.fn(),
  listBatches: vi.fn(),
}));

beforeEach(() => {
  push.mockReset();
  vi.mocked(useSession).mockReturnValue({ token: "token", centre: null });
  vi.mocked(listBatches).mockResolvedValue({
    batches: [{ id: "b1", name: "Class 10 Maths", subject: null, days: ["mon"], startTime: "16:00", endTime: "17:00", isActive: true, createdAt: "" }],
    nextCursor: null,
  });
  vi.mocked(createStudent).mockResolvedValue({
    student: { id: "s1", name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "+919876543210", whatsappOptIn: false, status: "active", batches: [] },
  });
});

describe("/students/new", () => {
  it("adds a student in the active batches picked, then shows the list", async () => {
    const user = userEvent.setup();
    render(<NewStudentPage />);

    expect(await screen.findByRole("checkbox", { name: "Class 10 Maths" })).toBeInTheDocument();
    expect(listBatches).toHaveBeenCalledWith("token", { status: "active" });
    await user.type(screen.getByLabelText("Student’s name"), "Aarav Sharma");
    await user.type(screen.getByLabelText("Parent’s name"), "Neha Sharma");
    await user.type(screen.getByLabelText("Parent’s mobile number"), "98765 43210");
    await user.click(screen.getByRole("checkbox", { name: "Class 10 Maths" }));
    await user.click(screen.getByRole("button", { name: "Add student" }));

    expect(createStudent).toHaveBeenCalledWith("token", expect.objectContaining({ name: "Aarav Sharma", batchIds: ["b1"] }));
    expect(push).toHaveBeenCalledWith("/students");
  });
});
