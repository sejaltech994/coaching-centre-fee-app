import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getAbsenceAlerts, getAttendance, listBatches, saveAttendance, setAbsenceAlerts, type AttendanceDay } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { Attendance } from "./Attendance";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBatches: vi.fn(),
  getAttendance: vi.fn(),
  saveAttendance: vi.fn(),
  getAbsenceAlerts: vi.fn(),
  setAbsenceAlerts: vi.fn(),
}));

const batch = (id: string, name: string) => ({
  id,
  name,
  subject: null,
  days: ["mon" as const],
  startTime: "16:00",
  endTime: "17:00",
  isActive: true,
  feePlan: null,
  createdAt: "",
});

const day: AttendanceDay = {
  batch: { id: "b1", name: "Class 10 Maths" },
  date: "2026-11-03",
  students: [
    { id: "s1", name: "Aarav Sharma", present: null },
    { id: "s2", name: "Diya Rao", present: true },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-03T04:30:00Z") });
  vi.mocked(listBatches).mockReset().mockResolvedValue({ batches: [batch("b1", "Class 10 Maths"), batch("b2", "Class 9 Science")], nextCursor: null });
  vi.mocked(getAttendance).mockReset().mockResolvedValue(day);
  vi.mocked(saveAttendance).mockReset();
  vi.mocked(getAbsenceAlerts).mockReset().mockResolvedValue({ on: false });
  vi.mocked(setAbsenceAlerts).mockReset().mockResolvedValue({ on: true });
  return () => vi.useRealTimers();
});

function setup() {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <Attendance token="token" />
    </ThemeRegistry>,
  );
  return { user };
}

const row = (name: string) => screen.getByRole("group", { name });

describe("Attendance", () => {
  it("opens today in India for the first batch, with each student's mark", async () => {
    setup();
    expect(await screen.findByRole("group", { name: "Aarav Sharma" })).toBeInTheDocument();
    expect(getAttendance).toHaveBeenCalledWith("token", "b1", "2026-11-03");
    expect(within(row("Aarav Sharma")).getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "false");
    expect(within(row("Diya Rao")).getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks students and saves, saying how many parents were told", async () => {
    vi.mocked(saveAttendance).mockResolvedValue({ ...day, absenceAlerts: { sent: 1, skipped: 0 } });
    const { user } = setup();

    await user.click(within(await screen.findByRole("group", { name: "Aarav Sharma" })).getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(saveAttendance).toHaveBeenCalledWith("token", {
      batchId: "b1",
      date: "2026-11-03",
      marks: [
        { studentId: "s1", present: false },
        { studentId: "s2", present: true },
      ],
    });
    expect(await screen.findByText("Attendance saved. Absence messages sent: 1.")).toBeInTheDocument();
  });

  it("marks everyone present at once", async () => {
    vi.mocked(saveAttendance).mockResolvedValue({ ...day, absenceAlerts: { sent: 0, skipped: 0 } });
    const { user } = setup();
    await screen.findByRole("group", { name: "Aarav Sharma" });

    await user.click(screen.getByRole("button", { name: "Mark all present" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(vi.mocked(saveAttendance).mock.calls[0]![1].marks.every((m) => m.present)).toBe(true);
    expect(await screen.findByText("Attendance saved.")).toBeInTheDocument();
  });

  it("loads another batch or day", async () => {
    const { user } = setup();
    await screen.findByRole("group", { name: "Aarav Sharma" });

    await user.click(screen.getByRole("combobox", { name: "Batch" }));
    await user.click(await screen.findByRole("option", { name: "Class 9 Science" }));
    expect(getAttendance).toHaveBeenLastCalledWith("token", "b2", "2026-11-03");

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-11-02" } });
    expect(getAttendance).toHaveBeenLastCalledWith("token", "b2", "2026-11-02");
  });

  it("turns absence alerts on", async () => {
    const { user } = setup();
    const toggle = await screen.findByRole("switch", { name: "Message parents on WhatsApp when their child is absent" });
    await user.click(toggle);
    expect(setAbsenceAlerts).toHaveBeenCalledWith("token", true);
    expect(toggle).toBeChecked();
  });

  it("puts the switch back when the change can't be saved", async () => {
    vi.mocked(setAbsenceAlerts).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup();
    const toggle = await screen.findByRole("switch", { name: "Message parents on WhatsApp when their child is absent" });
    await user.click(toggle);
    expect(await screen.findByText(/Can't reach Chukta/)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it("says when there's no batch to take attendance for", async () => {
    vi.mocked(listBatches).mockResolvedValue({ batches: [], nextCursor: null });
    setup();
    expect(await screen.findByText("Add a batch first, then take its attendance here.")).toBeInTheDocument();
  });

  it("says when a day can't be saved", async () => {
    vi.mocked(saveAttendance).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { date: "Attendance can’t be taken for a day that hasn’t come." } }),
    );
    const { user } = setup();
    await screen.findByRole("group", { name: "Aarav Sharma" });
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Attendance can’t be taken for a day that hasn’t come.");
  });
});
