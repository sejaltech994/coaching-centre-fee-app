import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getPaymentSettings, savePaymentSettings } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { PaymentSettings } from "./PaymentSettings";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPaymentSettings: vi.fn(),
  savePaymentSettings: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getPaymentSettings).mockReset().mockResolvedValue({ paymentSettings: { upiId: null, payeeName: null } });
  vi.mocked(savePaymentSettings).mockReset();
});

function setup() {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <PaymentSettings token="token" onSaved={onSaved} />
    </ThemeRegistry>,
  );
  return { user, onSaved };
}

const section = () => screen.getByRole("region", { name: "Payments" });

describe("PaymentSettings", () => {
  it("asks for the centre's UPI ID until there is one", async () => {
    setup();
    expect(await screen.findByText("Add your UPI ID so parents can pay you straight from their bill.")).toBeInTheDocument();
    expect(section()).toHaveTextContent("Chukta never holds the money");
  });

  it("saves the UPI ID and the name parents see", async () => {
    vi.mocked(savePaymentSettings).mockResolvedValue({ paymentSettings: { upiId: "sunrise@okicici", payeeName: "Sunrise Classes" } });
    const { user, onSaved } = setup();
    await user.click(await screen.findByRole("button", { name: "Add UPI ID" }));

    await user.type(within(section()).getByLabelText("UPI ID"), "Sunrise@OKICICI");
    await user.type(within(section()).getByLabelText("Name parents see"), "Sunrise Classes");
    await user.click(within(section()).getByRole("button", { name: "Save" }));

    expect(savePaymentSettings).toHaveBeenCalledWith("token", { upiId: "sunrise@okicici", payeeName: "Sunrise Classes" });
    expect(await within(section()).findByText("sunrise@okicici")).toBeInTheDocument();
    expect(section()).toHaveTextContent("Paid to Sunrise Classes");
    expect(onSaved).toHaveBeenCalled();
  });

  it("checks the UPI ID before sending it", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add UPI ID" }));
    await user.type(within(section()).getByLabelText("UPI ID"), "9876543210");
    await user.type(within(section()).getByLabelText("Name parents see"), "Sunrise");
    await user.click(within(section()).getByRole("button", { name: "Save" }));

    expect(savePaymentSettings).not.toHaveBeenCalled();
    expect(within(section()).getByLabelText("UPI ID")).toHaveAccessibleDescription("Enter a UPI ID like name@bank.");
  });

  it("changes a saved UPI ID, and says when saving fails", async () => {
    vi.mocked(getPaymentSettings).mockResolvedValue({ paymentSettings: { upiId: "sunrise@okicici", payeeName: "Sunrise Classes" } });
    vi.mocked(savePaymentSettings).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Change UPI ID" }));
    expect(within(section()).getByLabelText("UPI ID")).toHaveValue("sunrise@okicici");
    await user.click(within(section()).getByRole("button", { name: "Save" }));

    expect(await within(section()).findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });
});
