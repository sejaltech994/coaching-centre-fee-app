import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, requestOtp, verifyOtp, type LoginSession } from "@/lib/api";
import { clearSession, getAccessToken } from "@/lib/session";
import { LoginFlow } from "./LoginFlow";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

const session: LoginSession = {
  accessToken: "access-token",
  expiresIn: 900,
  isNewAccount: true,
  user: { id: "u1", phone: "+919876543210", name: null, role: "owner" },
  centre: { id: "c1", name: null, plan: "free" },
};

function setup(props: Partial<Parameters<typeof LoginFlow>[0]> = {}) {
  const onLoggedIn = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<LoginFlow onLoggedIn={onLoggedIn} {...props} />);
  return { user, onLoggedIn };
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Mobile number"), "98765 43210");
  await user.click(screen.getByRole("button", { name: "Get OTP" }));
  await screen.findByLabelText("6-digit code");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearSession();
  vi.mocked(requestOtp).mockReset().mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(verifyOtp).mockReset().mockResolvedValue(session);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginFlow: phone step", () => {
  it("starts with the number from the landing page already filled in", () => {
    setup({ initialPhone: "9876543210" });
    expect(screen.getByLabelText("Mobile number")).toHaveValue("9876543210");
  });

  it("explains an invalid number without calling the API", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText("Mobile number"), "12345");
    await user.click(screen.getByRole("button", { name: "Get OTP" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit Indian mobile number.");
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("sends the normalised number and moves to the code step", async () => {
    const { user } = setup();

    await reachCodeStep(user);

    expect(requestOtp).toHaveBeenCalledWith("+919876543210");
    expect(screen.getByText(/sent a 6-digit code to \+91 98765 43210/)).toBeInTheDocument();
  });

  it("shows the server's message when sending fails", async () => {
    vi.mocked(requestOtp).mockRejectedValueOnce(
      new ApiRequestError(429, "rate_limited", "Too many codes requested. Try again later."),
    );
    const { user } = setup({ initialPhone: "9876543210" });

    await user.click(screen.getByRole("button", { name: "Get OTP" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many codes requested. Try again later.");
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });
});

describe("LoginFlow: code step", () => {
  it("logs in with the right code and keeps the token in memory", async () => {
    const { user, onLoggedIn } = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(verifyOtp).toHaveBeenCalledWith("+919876543210", "123456");
    expect(onLoggedIn).toHaveBeenCalledWith(session);
    expect(getAccessToken()).toBe("access-token");
  });

  it("only accepts digits, up to six", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "12a34567");

    expect(screen.getByLabelText("6-digit code")).toHaveValue("123456");
  });

  it("asks for all six digits before verifying", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "123");
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code.");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("shows how many attempts are left after a wrong code, and clears the box", async () => {
    vi.mocked(verifyOtp).mockRejectedValueOnce(
      new ApiRequestError(400, "invalid_otp", "That code is not right. 4 attempts left.", { attemptsLeft: 4 }),
    );
    const { user, onLoggedIn } = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right. 4 attempts left.");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("counts down 30 seconds before allowing a resend", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    expect(screen.getByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeEnabled();
    await user.click(resend);
    expect(requestOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();
  });

  it("lets the user go back and change the number", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    await user.click(screen.getByRole("button", { name: "Change number" }));

    expect(screen.getByLabelText("Mobile number")).toHaveValue("98765 43210");
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });
});
