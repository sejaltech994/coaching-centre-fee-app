import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, confirmPhone, sendPhoneCode, type Me } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { PhoneConfirm } from "./PhoneConfirm";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  sendPhoneCode: vi.fn(),
  confirmPhone: vi.fn(),
}));

const confirmedUser: Me["user"] = {
  id: "u1",
  phone: "+919876543210",
  phoneVerified: true,
  fullName: "Asha Sharma",
  email: "asha@example.com",
  role: "owner",
};

beforeEach(() => {
  vi.mocked(sendPhoneCode).mockReset().mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(confirmPhone).mockReset().mockResolvedValue({ user: confirmedUser });
});

afterEach(() => vi.useRealTimers());

function setup() {
  const onConfirmed = vi.fn();
  const onCancel = vi.fn();
  // With fake timers (the resend countdown), user-event's own pauses must move them too.
  const user = userEvent.setup(vi.isFakeTimers() ? { advanceTimers: (ms) => vi.advanceTimersByTime(ms) } : {});
  render(
    <ThemeRegistry>
      <PhoneConfirm token="token" phone="+919876543210" onConfirmed={onConfirmed} onCancel={onCancel} />
    </ThemeRegistry>,
  );
  return { user, onConfirmed, onCancel };
}

async function sendTo(user: ReturnType<typeof userEvent.setup>, number?: string) {
  if (number !== undefined) {
    await user.clear(screen.getByLabelText("Mobile number"));
    await user.type(screen.getByLabelText("Mobile number"), number);
  }
  await user.click(screen.getByRole("button", { name: "Send code" }));
}

async function enter(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(await screen.findByLabelText("Digit 1"));
  await user.keyboard(code);
  await user.click(screen.getByRole("button", { name: "Confirm" }));
}

describe("PhoneConfirm", () => {
  it("texts a code to the owner's number and confirms it", async () => {
    const { user, onConfirmed } = setup();
    expect(screen.getByLabelText("Mobile number")).toHaveValue("98765 43210");

    await sendTo(user);
    expect(sendPhoneCode).toHaveBeenCalledWith("token", "98765 43210");
    expect(await screen.findByText("Sent by SMS to +91 98765 43210.")).toBeInTheDocument();

    await enter(user, "482913");

    expect(confirmPhone).toHaveBeenCalledWith("token", "98765 43210", "482913");
    expect(onConfirmed).toHaveBeenCalledWith(confirmedUser);
  });

  it("can confirm a different number instead", async () => {
    const { user } = setup();

    await sendTo(user, "91234 56789");
    await enter(user, "482913");

    expect(sendPhoneCode).toHaveBeenCalledWith("token", "91234 56789");
    expect(confirmPhone).toHaveBeenCalledWith("token", "91234 56789", "482913");
  });

  it("explains a number that isn't an Indian mobile, without sending", async () => {
    const { user } = setup();

    await sendTo(user, "12345");

    expect(sendPhoneCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mobile number")).toHaveAccessibleDescription("Enter a 10-digit Indian mobile number.");
  });

  it("explains a number another account has confirmed", async () => {
    vi.mocked(sendPhoneCode).mockRejectedValue(new ApiRequestError(409, "phone_taken", "x"));
    const { user } = setup();

    await sendTo(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another Chukta account has confirmed this number. Use a different one.",
    );
  });

  it("asks for all six digits before checking", async () => {
    const { user } = setup();
    await sendTo(user);

    await enter(user, "4829");

    expect(confirmPhone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code.");
  });

  it("says how many tries a wrong code leaves, and clears the boxes", async () => {
    vi.mocked(confirmPhone).mockRejectedValue(new ApiRequestError(400, "invalid_otp", "x", { attemptsLeft: 4 }));
    const { user } = setup();
    await sendTo(user);

    await enter(user, "000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn’t match. 4 tries left.");
    expect(screen.getByLabelText("Digit 1")).toHaveValue("");
    expect(screen.getByLabelText("Digit 1")).toHaveAttribute("aria-invalid", "true");
  });

  it("offers a new code after 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = setup();
    await sendTo(user);

    expect(await screen.findByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await user.click(screen.getByRole("button", { name: "Resend code" }));

    expect(sendPhoneCode).toHaveBeenCalledTimes(2);
  });

  it("goes back to change the number", async () => {
    const { user } = setup();
    await sendTo(user);

    await user.click(await screen.findByRole("button", { name: "Use a different number" }));

    expect(screen.getByLabelText("Mobile number")).toHaveValue("98765 43210");
  });

  it("can be cancelled", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
