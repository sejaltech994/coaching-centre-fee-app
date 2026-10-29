import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, cancelPro, startPro, type Subscription } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { PlanCard } from "./PlanCard";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  startPro: vi.fn(),
  cancelPro: vi.fn(),
}));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn() }));

const free: Subscription = { plan: "free", status: null, renewsAt: null, proPricePaise: 49900, canUpgrade: true, students: { active: 12, max: 25 } };
const pro: Subscription = { ...free, plan: "pro", status: "active", renewsAt: "2026-12-02T00:00:00.000Z", students: { active: 40, max: null } };

beforeEach(() => {
  vi.mocked(startPro).mockReset();
  vi.mocked(cancelPro).mockReset();
  vi.mocked(navigate).mockReset();
});

function setup(subscription: Subscription) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <PlanCard token="token" subscription={subscription} onChange={onChange} />
    </ThemeRegistry>,
  );
  return { user, onChange };
}

describe("PlanCard", () => {
  it("shows Free and how many of its students are used, and goes Pro on Razorpay's checkout", async () => {
    vi.mocked(startPro).mockResolvedValue({ url: "https://rzp.io/i/sub" });
    const { user } = setup(free);

    expect(screen.getByRole("region", { name: "Plan" })).toHaveTextContent("Free");
    expect(screen.getByText("12 of 25 students")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go Pro: ₹499 a month" }));

    expect(startPro).toHaveBeenCalledWith("token");
    expect(navigate).toHaveBeenCalledWith("https://rzp.io/i/sub");
  });

  it("says when Pro can't be bought here", () => {
    setup({ ...free, canUpgrade: false });
    expect(screen.queryByRole("button", { name: /Go Pro/ })).not.toBeInTheDocument();
    expect(screen.getByText("Pro isn't available here yet.")).toBeInTheDocument();
  });

  it("shows Pro and when it renews, and cancels at the end of the paid month", async () => {
    vi.mocked(cancelPro).mockResolvedValue({ plan: "pro", status: "cancelled", renewsAt: pro.renewsAt });
    const { user, onChange } = setup(pro);
    expect(screen.getByRole("region", { name: "Plan" })).toHaveTextContent("Pro");
    expect(screen.getByText("Renews on 2 Dec 2026")).toBeInTheDocument();
    expect(screen.getByText("40 students")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel Pro" }));

    expect(cancelPro).toHaveBeenCalledWith("token");
    expect(onChange).toHaveBeenCalledWith({ ...pro, status: "cancelled" });
  });

  it("says when a cancelled Pro ends", () => {
    setup({ ...pro, status: "cancelled" });
    expect(screen.getByText("Pro until 2 Dec 2026, then Free.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Pro" })).not.toBeInTheDocument();
  });

  it("explains a failed upgrade", async () => {
    vi.mocked(startPro).mockRejectedValue(new ApiRequestError(503, "upgrade_unavailable", "Upgrading isn't available here yet."));
    const { user } = setup(free);
    await user.click(screen.getByRole("button", { name: "Go Pro: ₹499 a month" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upgrading isn't available here yet.");
  });
});
