import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getGooglePending, requestOtp, verifyOtp, type LoginSession } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import { LoginFlow } from "./LoginFlow";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getGooglePending: vi.fn(),
}));
vi.mock("@/lib/navigate", () => ({ navigate: vi.fn() }));

const session: LoginSession = {
  status: "signed_in",
  accessToken: "access-token",
  expiresIn: 900,
  isNewAccount: false,
  user: { id: "u1", phone: "+919876543210", fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

type Props = Partial<Parameters<typeof LoginFlow>[0]>;

function setup(props: Props = {}) {
  const onSignedIn = vi.fn();
  const user = userEvent.setup();
  render(<LoginFlow onSignedIn={onSignedIn} googleEnabled {...props} />);
  return { user, onSignedIn };
}

async function verifyNumber(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Mobile number"), "9876543210");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await user.click(await screen.findByLabelText("Digit 1"));
  await user.keyboard("123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
}

beforeEach(() => {
  vi.mocked(requestOtp).mockReset().mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
  vi.mocked(verifyOtp).mockReset().mockResolvedValue(session);
  vi.mocked(getGooglePending).mockReset().mockResolvedValue({ email: "asha@example.com", name: "Asha Sharma" });
  vi.mocked(navigate).mockReset();
});

describe("LoginFlow: Google on the welcome screen", () => {
  it("offers Google above the mobile number, and goes to Google through the API", async () => {
    const { user } = setup();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Continue with Google", "Continue with mobile number"]);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(navigate).toHaveBeenCalledWith("http://localhost:8787/api/v1/auth/google/start");
  });

  it("hides Google when this build doesn't have it", () => {
    setup({ googleEnabled: false });
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it.each([
    ["cancelled", "Google sign-in was cancelled. Try again, or continue with your mobile number."],
    ["email_unverified", "Google hasn’t verified this email. Use another Google account or your mobile number."],
    ["unavailable", "Google sign-in isn’t available right now. Continue with your mobile number."],
    ["failed", "Google sign-in didn’t work. Try again, or continue with your mobile number."],
    ["anything-else", "Google sign-in didn’t work. Try again, or continue with your mobile number."],
  ])("explains a Google sign-in that came back %s", (googleError, message) => {
    setup({ googleError });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("heading", { name: "Welcome to Chukta" })).toBeInTheDocument();
  });
});

describe("LoginFlow: after Google", () => {
  it("asks a new Google account for a mobile number, naming the account", async () => {
    setup({ via: "google" });

    expect(await screen.findByRole("heading", { name: "Verify your mobile number" })).toBeInTheDocument();
    expect(screen.getByText(/Signed in with Google as asha@example\.com\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
  });

  it("explains when the Google email already has an account", async () => {
    setup({ via: "google", hint: "email_in_use" });

    expect(
      await screen.findByText("This email already has a Chukta account. Verify its mobile number to connect Google."),
    ).toBeInTheDocument();
  });

  it("goes back to the welcome screen when the Google sign-in has expired", async () => {
    vi.mocked(getGooglePending).mockRejectedValue(new ApiRequestError(404, "google_pending_missing", "x"));
    setup({ via: "google" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Your Google sign-in has expired. Continue with Google again.");
    expect(screen.getByRole("heading", { name: "Welcome to Chukta" })).toBeInTheDocument();
  });

  it("fills the profile with the Google name and email", async () => {
    vi.mocked(verifyOtp).mockResolvedValue({
      status: "signup_required",
      signupTicket: "t1",
      phone: "+919876543210",
      expiresIn: 900,
      google: { email: "asha@example.com", name: "Asha Sharma" },
    });
    const { user } = setup({ via: "google" });
    await screen.findByRole("heading", { name: "Verify your mobile number" });

    await verifyNumber(user);

    expect(await screen.findByLabelText("Your name")).toHaveValue("Asha Sharma");
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("asha@example.com");
  });

  it("signs straight in when the number's account gets Google connected", async () => {
    vi.mocked(verifyOtp).mockResolvedValue({ ...session, linkedGoogle: true });
    const { user, onSignedIn } = setup({ via: "google", hint: "email_in_use" });
    await screen.findByRole("heading", { name: "Verify your mobile number" });

    await verifyNumber(user);

    expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ linkedGoogle: true }));
  });

  it.each([
    ["google_already_linked", "This account is already connected to a different Google account."],
    ["google_in_use", "This Google account is connected to another Chukta account."],
  ])("explains %s", async (code, message) => {
    vi.mocked(verifyOtp).mockRejectedValue(new ApiRequestError(409, code, "x"));
    const { user } = setup({ via: "google" });
    await screen.findByRole("heading", { name: "Verify your mobile number" });

    await verifyNumber(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
