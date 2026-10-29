import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, downloadMonthlyReport, getDashboardSummary, previewReminder, sendReminders, type DashboardSummary } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { Dashboard } from "./Dashboard";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDashboardSummary: vi.fn(),
  previewReminder: vi.fn(),
  sendReminders: vi.fn(),
  downloadMonthlyReport: vi.fn(),
}));

const summary: DashboardSummary = {
  month: "2026-11",
  collectedPaise: 260000,
  billedPaise: 520000,
  outstandingPaise: 260000,
  overduePaise: 520000,
  defaulters: [
    { student: { id: "s2", name: "Diya Rao", parentName: "Ravi Rao" }, overduePaise: 520000, bills: 2, oldestDueDate: "2026-10-05", invoiceIds: ["i3", "i4"] },
  ],
};

beforeEach(() => {
  vi.mocked(getDashboardSummary).mockReset().mockResolvedValue(summary);
  vi.mocked(previewReminder).mockReset().mockResolvedValue({ text: "Hello Ravi Rao…", canSend: true, reason: null });
  vi.mocked(sendReminders).mockReset().mockResolvedValue({ results: [{ invoiceId: "i3", status: "sent", error: null }, { invoiceId: "i4", status: "sent", error: null }] });
});

function setup(plan: "free" | "pro" = "free") {
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <Dashboard token="token" plan={plan} />
    </ThemeRegistry>,
  );
  return { user };
}

const tile = (name: string) => screen.getByRole("region", { name });

describe("Dashboard", () => {
  it("shows this month's money: collected, still to collect of what was billed, and overdue", async () => {
    setup();

    expect(await screen.findByRole("region", { name: "Collected" })).toBeInTheDocument();
    expect(getDashboardSummary).toHaveBeenCalledWith("token", undefined);
    expect(tile("Collected")).toHaveTextContent("₹2,600");
    expect(tile("Collected")).toHaveTextContent("Received in Nov 2026");
    expect(tile("Still to collect")).toHaveTextContent("₹2,600");
    expect(tile("Still to collect")).toHaveTextContent("Of ₹5,200 billed for Nov 2026");
    expect(tile("Overdue")).toHaveTextContent("₹5,200");
    expect(tile("Overdue")).toHaveTextContent("From every month");
  });

  it("lists who owes, most first, and reminds them all at once", async () => {
    const { user } = setup();
    const owing = await screen.findByRole("region", { name: "Who owes" });
    const [row] = within(owing).getAllByRole("row").slice(1);
    expect(row).toHaveTextContent("Diya Rao");
    expect(row).toHaveTextContent("Ravi Rao");
    expect(row).toHaveTextContent("₹5,200");
    expect(row).toHaveTextContent("2");
    expect(row).toHaveTextContent("5 Oct 2026");

    await user.click(within(owing).getByRole("button", { name: "Remind all (2)" }));
    await user.click(await screen.findByRole("button", { name: "Send" }));

    expect(sendReminders).toHaveBeenCalledWith("token", ["i3", "i4"]);
    expect(await screen.findByText("Sent 2, skipped 0.")).toBeInTheDocument();
  });

  it("looks at another month", async () => {
    setup();
    await screen.findByRole("region", { name: "Collected" });
    expect(screen.getByLabelText("Month")).toHaveValue("2026-11");

    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-10" } });

    expect(getDashboardSummary).toHaveBeenLastCalledWith("token", "2026-10");
  });

  it("says when nobody owes anything", async () => {
    vi.mocked(getDashboardSummary).mockResolvedValue({ ...summary, overduePaise: 0, defaulters: [] });
    setup();
    expect(await screen.findByText("Nobody owes anything overdue.")).toBeInTheDocument();
  });

  it("points a new centre to its first steps until anything is billed", async () => {
    vi.mocked(getDashboardSummary).mockResolvedValue({ month: "2026-11", collectedPaise: 0, billedPaise: 0, outstandingPaise: 0, overduePaise: 0, defaulters: [] });
    setup();
    expect(await screen.findByRole("link", { name: "Set up batches" })).toHaveAttribute("href", "/batches");
  });

  it("says when the figures can't be loaded", async () => {
    vi.mocked(getDashboardSummary).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });

  it("downloads the month's report on Pro", async () => {
    vi.mocked(downloadMonthlyReport).mockResolvedValue(new Blob(["Bill"], { type: "text/csv" }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:report"), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = setup("pro");

    await user.click(await screen.findByRole("button", { name: "Download Nov 2026 report" }));

    expect(downloadMonthlyReport).toHaveBeenCalledWith("token", "2026-11");
    expect(click).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("says monthly reports come with Pro", async () => {
    setup("free");
    expect(await screen.findByText("Monthly reports come with Pro.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /report/ })).not.toBeInTheDocument();
  });
});
