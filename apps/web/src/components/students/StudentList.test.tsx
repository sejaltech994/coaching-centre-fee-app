import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, listBatches, listStudents, type StudentSummary } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { StudentList } from "./StudentList";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listStudents: vi.fn(),
  listBatches: vi.fn(),
}));

const student = (name: string, extra: Partial<StudentSummary> = {}): StudentSummary => ({
  id: name.toLowerCase().replace(/\W/g, "-"),
  name,
  parentName: "Neha Sharma",
  parentPhone: "+919876543210",
  whatsappOptIn: true,
  status: "active",
  batches: [],
  ...extra,
});

beforeEach(() => {
  vi.mocked(listBatches).mockReset().mockResolvedValue({
    batches: [{ id: "b1", name: "Class 10 Maths", subject: null, days: ["mon"], startTime: "16:00", endTime: "17:00", isActive: true, feePlan: null, createdAt: "" }],
    nextCursor: null,
  });
  vi.mocked(listStudents)
    .mockReset()
    .mockResolvedValue({
      students: [
        student("Aarav Sharma", { batches: [{ id: "b1", name: "Class 10 Maths", enrolmentId: "e1", since: "2026-11-02", feePlan: null, discountPaise: 0 }] }),
        student("Ishita Rao", { parentName: "Suresh Rao", parentPhone: "+919123456789" }),
      ],
      nextCursor: null,
    });
});

function setup() {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <StudentList token="token" />
    </ThemeRegistry>,
  );
  return { user };
}

describe("StudentList", () => {
  it("lists students with their parent, number and batches, each linking to the student", async () => {
    setup();

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "Aarav SharmaNeha Sharma+91 98765 43210Class 10 Maths",
      "Ishita RaoSuresh Rao+91 91234 56789No batch",
    ]);
    expect(within(rows[0]!).getByRole("link", { name: "Aarav Sharma" })).toHaveAttribute("href", "/students/edit?id=aarav-sharma");
    expect(listStudents).toHaveBeenCalledWith("token", { status: "active" });
  });

  it("filters by status, batch and a search", async () => {
    const { user } = setup();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Left" }));
    expect(listStudents).toHaveBeenLastCalledWith("token", { status: "left" });

    await user.click(screen.getByRole("combobox", { name: "Batch" }));
    await user.click(await screen.findByRole("option", { name: "Class 10 Maths" }));
    expect(listStudents).toHaveBeenLastCalledWith("token", { status: "left", batchId: "b1" });

    await user.type(screen.getByRole("searchbox", { name: "Search students or parents" }), "rao");
    await vi.waitFor(() => expect(listStudents).toHaveBeenLastCalledWith("token", { status: "left", batchId: "b1", q: "rao" }));
  });

  it("shows more when there are more", async () => {
    vi.mocked(listStudents)
      .mockResolvedValueOnce({ students: [student("Aarav Sharma")], nextCursor: "c1" })
      .mockResolvedValueOnce({ students: [student("Zoya Khan")], nextCursor: null });
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Show more" }));

    expect(listStudents).toHaveBeenLastCalledWith("token", { status: "active", cursor: "c1" });
    expect(await screen.findByText("Zoya Khan")).toBeInTheDocument();
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("invites the first student when there are none, and says when nothing matches", async () => {
    vi.mocked(listStudents).mockResolvedValue({ students: [], nextCursor: null });
    const { user } = setup();

    expect(await screen.findByText("No students yet. Add your first student to start sending fee reminders.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Left" }));
    expect(await screen.findByText("No students match.")).toBeInTheDocument();
  });

  it("says when the list can't be loaded", async () => {
    vi.mocked(listStudents).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });
});
