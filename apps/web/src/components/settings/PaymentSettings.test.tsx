import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, connectRazorpay, disconnectRazorpay, getPaymentSettings, savePaymentSettings } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { PaymentSettings } from "./PaymentSettings";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPaymentSettings: vi.fn(),
  savePaymentSettings: vi.fn(),
  connectRazorpay: vi.fn(),
  disconnectRazorpay: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getPaymentSettings).mockReset().mockResolvedValue({ paymentSettings: { upiId: null, payeeName: null, razorpay: null } });
  vi.mocked(savePaymentSettings).mockReset();
  vi.mocked(connectRazorpay).mockReset();
  vi.mocked(disconnectRazorpay).mockReset().mockResolvedValue(undefined);
});

const RAZORPAY = { keyId: "rzp_test_abc123", webhookUrl: "https://chukta.example/api/v1/webhooks/razorpay/c1" };

function setup(plan: "free" | "pro" = "pro") {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <PaymentSettings token="token" plan={plan} onSaved={onSaved} />
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
    vi.mocked(getPaymentSettings).mockResolvedValue({ paymentSettings: { upiId: "sunrise@okicici", payeeName: "Sunrise Classes", razorpay: null } });
    vi.mocked(savePaymentSettings).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Change UPI ID" }));
    expect(within(section()).getByLabelText("UPI ID")).toHaveValue("sunrise@okicici");
    await user.click(within(section()).getByRole("button", { name: "Save" }));

    expect(await within(section()).findByRole("alert")).toHaveTextContent("Can't reach Chukta.");
  });

  it("connects the centre's own Razorpay account and shows the webhook to add there", async () => {
    vi.mocked(connectRazorpay).mockResolvedValue({ razorpay: RAZORPAY });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Connect Razorpay" }));

    await user.type(within(section()).getByLabelText("Key ID"), "rzp_test_abc123");
    await user.type(within(section()).getByLabelText("Key secret"), "key-secret");
    await user.type(within(section()).getByLabelText("Webhook secret"), "webhook-secret");
    expect(within(section()).getByLabelText("Key secret")).toHaveAttribute("type", "password");
    await user.click(within(section()).getByRole("button", { name: "Connect" }));

    expect(connectRazorpay).toHaveBeenCalledWith("token", { keyId: "rzp_test_abc123", keySecret: "key-secret", webhookSecret: "webhook-secret" });
    expect(await within(section()).findByText("Razorpay connected: rzp_test_abc123")).toBeInTheDocument();
    expect(section()).toHaveTextContent(RAZORPAY.webhookUrl);
    expect(section()).toHaveTextContent("payment_link.paid");
  });

  it("shows Razorpay's refusal beside the field", async () => {
    vi.mocked(connectRazorpay).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { keySecret: "Razorpay didn’t accept these keys. Check the key ID and secret." } }),
    );
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Connect Razorpay" }));
    await user.click(within(section()).getByRole("button", { name: "Connect" }));

    expect(await within(section()).findByLabelText("Key secret")).toHaveAccessibleDescription(
      "Razorpay didn’t accept these keys. Check the key ID and secret.",
    );
  });

  it("disconnects Razorpay", async () => {
    vi.mocked(getPaymentSettings).mockResolvedValue({ paymentSettings: { upiId: null, payeeName: null, razorpay: RAZORPAY } });
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Disconnect Razorpay" }));

    expect(disconnectRazorpay).toHaveBeenCalledWith("token");
    expect(await screen.findByRole("button", { name: "Connect Razorpay" })).toBeInTheDocument();
  });

  it("offers the centre's own Razorpay only with Pro", async () => {
    setup("free");
    expect(await screen.findByText("Card payments through your own Razorpay account come with Pro.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Razorpay" })).not.toBeInTheDocument();
  });
});
