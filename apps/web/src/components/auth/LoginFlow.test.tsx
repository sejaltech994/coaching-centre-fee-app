import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, registerOwner, requestOtp, verifyOtp, type LoginSession } from "@/lib/api";
import { clearSession, getAccessToken } from "@/lib/session";
import { LoginFlow } from "./LoginFlow";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  registerOwner: vi.fn(),
}));

const session: LoginSession = {
  status: "signed_in",
  accessToken: "access-token",
  expiresIn: 900,
  isNewAccount: false,
  user: { id: "u1", phone: "+919876543210", fullName: "Asha Sharma", email: null, role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

function setup(props: Partial<Parameters<typeof LoginFlow>[0]> = {}) {
  const onSignedIn = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<LoginFlow onSignedIn={onSignedIn} {...props} />);
  return { user, onSignedIn };
}

type User = ReturnType<typeof userEvent.setup>;

async function reachPhoneStep(user: User) {
  await user.click(screen.getByRole("button", { name: "Continue with mobile number" }));
}

async function reachCodeStep(user: User) {
  await reachPhoneStep(user);
  await user.type(screen.getByLabelText("Mobile number"), "98765 43210");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByRole("heading", { name: "Enter the code" });
}

async function enterCode(user: User, code: string) {
  await user.click(screen.getByLabelText("Digit 1"));
  await user.keyboard(code);
  await user.click(screen.getByRole("button", { name: "Verify" }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearSession();
  vi.mocked(requestOtp).mockReset().mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(verifyOtp).mockReset().mockResolvedValue(session);
  vi.mocked(registerOwner).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginFlow: welcome", () => {
  it("explains that sign-up and login are the same steps, with links to the terms", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Welcome to Chukta" })).toBeInTheDocument();
    expect(screen.getByText(/Sign up or log in with the same steps/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");
  });

  it("doesn't offer Google until it is available", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
  });

  it("starts at the mobile number, filled in, when the landing page sent one", () => {
    setup({ initialPhone: "98765 43210" });
    expect(screen.getByRole("heading", { name: "Your mobile number" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toHaveValue("98765 43210");
  });
});

describe("LoginFlow: mobile number", () => {
  it("shows the +91 prefix and that only Indian numbers work", async () => {
    const { user } = setup();
    await reachPhoneStep(user);

    expect(screen.getByText("+91")).toBeInTheDocument();
    expect(screen.getByText("Indian numbers only for now.")).toBeInTheDocument();
  });

  it("explains an invalid number without calling the API", async () => {
    const { user } = setup();
    await reachPhoneStep(user);

    await user.type(screen.getByLabelText("Mobile number"), "12345");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit Indian mobile number.");
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("sends the normalised number and moves to the code step", async () => {
    const { user } = setup();

    await reachCodeStep(user);

    expect(requestOtp).toHaveBeenCalledWith("+919876543210");
    expect(screen.getByText(/Sent by SMS to \+91 98765 43210\./)).toBeInTheDocument();
  });

  it("shows the server's message when sending fails", async () => {
    vi.mocked(requestOtp).mockRejectedValueOnce(
      new ApiRequestError(429, "rate_limited", "Too many codes requested. Try again later."),
    );
    const { user } = setup({ initialPhone: "9876543210" });

    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many codes requested. Try again later.");
    expect(screen.queryByRole("group", { name: "6-digit code" })).not.toBeInTheDocument();
  });

  it("goes back to the welcome screen", async () => {
    const { user } = setup();
    await reachPhoneStep(user);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "Welcome to Chukta" })).toBeInTheDocument();
  });
});

describe("LoginFlow: code", () => {
  it("signs a returning owner in and keeps the token in memory", async () => {
    const { user, onSignedIn } = setup();
    await reachCodeStep(user);

    await enterCode(user, "123456");

    expect(verifyOtp).toHaveBeenCalledWith("+919876543210", "123456");
    expect(onSignedIn).toHaveBeenCalledWith(session);
    expect(getAccessToken()).toBe("access-token");
  });

  it("asks a new number to set up their centre, then signs them in", async () => {
    vi.mocked(verifyOtp).mockResolvedValueOnce({
      status: "signup_required",
      signupTicket: "ticket-1",
      phone: "+919876543210",
      expiresIn: 900,
    });
    const created = { ...session, isNewAccount: true };
    vi.mocked(registerOwner).mockResolvedValue(created);
    const { user, onSignedIn } = setup();
    await reachCodeStep(user);

    await enterCode(user, "123456");

    expect(await screen.findByRole("heading", { name: "Set up your centre" })).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Your name"), "Asha Sharma");
    await user.type(screen.getByLabelText("Centre name"), "Sunrise Classes");
    await user.type(screen.getByLabelText("City"), "Pune");
    await user.selectOptions(screen.getByLabelText("Type of centre"), "Coaching");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(registerOwner).toHaveBeenCalledWith(expect.objectContaining({ signupTicket: "ticket-1" }));
    expect(onSignedIn).toHaveBeenCalledWith(created);
    expect(getAccessToken()).toBe("access-token");
  });

  it("asks for all six digits before verifying", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    await enterCode(user, "123");

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code.");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("says how many tries are left after a wrong code, and clears the boxes", async () => {
    vi.mocked(verifyOtp).mockRejectedValueOnce(
      new ApiRequestError(400, "invalid_otp", "That code didn’t match. 4 tries left.", { attemptsLeft: 4 }),
    );
    const { user, onSignedIn } = setup();
    await reachCodeStep(user);

    await enterCode(user, "000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn’t match. 4 tries left.");
    expect(screen.getByLabelText("Digit 1")).toHaveValue("");
    expect(screen.getByLabelText("Digit 1")).toHaveAttribute("aria-invalid", "true");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("counts down 30 seconds before allowing a resend", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    expect(screen.getByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();
    expect(screen.getByText(/Valid for 5 minutes/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeEnabled();
    await user.click(resend);
    expect(requestOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();
  });

  it("lets the owner go back and change the number", async () => {
    const { user } = setup();
    await reachCodeStep(user);

    await user.click(screen.getByRole("button", { name: "Change number" }));

    expect(screen.getByLabelText("Mobile number")).toHaveValue("98765 43210");
    expect(screen.queryByRole("group", { name: "6-digit code" })).not.toBeInTheDocument();
  });
});
