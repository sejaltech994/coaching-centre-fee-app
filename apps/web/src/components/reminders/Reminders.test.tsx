import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getReminderTone, listReminders, setReminderTone, type Reminder } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { Reminders } from "./Reminders";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listReminders: vi.fn(),
  getReminderTone: vi.fn(),
  setReminderTone: vi.fn(),
}));

const reminder = (extra: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  kind: "pre_due",
  status: "read",
  template: "chukta_fee_due_gentle_v1",
  error: null,
  invoice: { id: "i1", number: 1 },
  student: { id: "s1", name: "Aarav Sharma" },
  sentAt: "2026-11-02T04:30:00.000Z",
  createdAt: "2026-11-02T04:30:00.000Z",
  ...extra,
});

beforeEach(() => {
  vi.mocked(listReminders).mockReset().mockResolvedValue({
    reminders: [reminder(), reminder({ id: "r2", kind: "manual", status: "skipped", error: "The parent hasn’t agreed to WhatsApp messages.", sentAt: null })],
    nextCursor: null,
  });
  vi.mocked(getReminderTone).mockReset().mockResolvedValue({ tone: "gentle" });
  vi.mocked(setReminderTone).mockReset().mockResolvedValue({ tone: "firm" });
});

function setup() {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <Reminders token="token" />
    </ThemeRegistry>,
  );
  return { user };
}

describe("Reminders", () => {
  it("lists what was sent to whom, and how it went", async () => {
    setup();
    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Aarav Sharma");
    expect(rows[0]).toHaveTextContent("#1");
    expect(rows[0]).toHaveTextContent("3 days before");
    expect(rows[0]).toHaveTextContent("Read");
    expect(rows[1]).toHaveTextContent("Sent by you");
    expect(rows[1]).toHaveTextContent("Not sent");
    expect(rows[1]).toHaveTextContent("The parent hasn’t agreed to WhatsApp messages.");
  });

  it("explains the schedule when nothing has been sent yet", async () => {
    vi.mocked(listReminders).mockResolvedValue({ reminders: [], nextCursor: null });
    setup();
    expect(await screen.findByText(/No reminders yet\./)).toBeInTheDocument();
  });

  it("changes the tone of every reminder", async () => {
    const { user } = setup();
    const tone = await screen.findByRole("group", { name: "Tone" });
    expect(within(tone).getByRole("button", { name: "Gentle" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(tone).getByRole("button", { name: "Firm" }));

    expect(setReminderTone).toHaveBeenCalledWith("token", "firm");
    expect(await screen.findByText("Reminders will now be firm.")).toBeInTheDocument();
  });

  it("says when reminders can't be loaded", async () => {
    vi.mocked(listReminders).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });
});
