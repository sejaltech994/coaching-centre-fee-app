import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getGooglePending, registerOwner, type LoginSession } from "@/lib/api";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { SignUpForm } from "./SignUpForm";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getGooglePending: vi.fn(),
  registerOwner: vi.fn(),
}));

const session: LoginSession = {
  status: "signed_in",
  accessToken: "access-token",
  expiresIn: 900,
  isNewAccount: true,
  user: { id: "u1", phone: "+919876543210", phoneVerified: false, fullName: "Asha Sharma", email: "asha@example.com", role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

beforeEach(() => {
  vi.mocked(getGooglePending).mockReset().mockResolvedValue({ email: "asha@example.com", name: "Asha Sharma" });
  vi.mocked(registerOwner).mockReset().mockResolvedValue(session);
});

function setup() {
  const onSignedUp = vi.fn();
  const onExpired = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeRegistry>
      <SignUpForm onSignedUp={onSignedUp} onExpired={onExpired} />
    </ThemeRegistry>,
  );
  return { user, onSignedUp, onExpired };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Mobile number"), "98765 43210");
  await user.type(screen.getByLabelText("Centre name"), "Sunrise Classes");
  await user.type(screen.getByLabelText("City"), "Pune");
  await user.click(screen.getByRole("button", { name: "Coaching" }));
  await user.click(screen.getByRole("checkbox", { name: /I agree to the Terms/ }));
}

describe("SignUpForm", () => {
  it("names the Google account and fills in its name", async () => {
    setup();

    expect(await screen.findByRole("heading", { level: 1, name: "Tell us about your centre" })).toBeInTheDocument();
    expect(screen.getByText(/Signed in with Google as asha@example\.com\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveValue("Asha Sharma");
    expect(screen.getByText("For fee reminders on WhatsApp. You’ll confirm it later.")).toBeInTheDocument();
    expect(screen.getByText("+91")).toBeInTheDocument();
  });

  it("offers the centre types as a single choice", async () => {
    const { user } = setup();
    const group = await screen.findByRole("group", { name: "Centre type" });
    expect(group).toHaveTextContent("TuitionCoachingDanceMusicSportsOther");

    await user.click(screen.getByRole("button", { name: "Dance" }));
    await user.click(screen.getByRole("button", { name: "Music" }));

    expect(screen.getByRole("button", { name: "Music" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dance" })).toHaveAttribute("aria-pressed", "false");
  });

  it("creates the account and hands over the session", async () => {
    const { user, onSignedUp } = setup();
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(registerOwner).toHaveBeenCalledWith({
      fullName: "Asha Sharma",
      phone: "98765 43210",
      centreName: "Sunrise Classes",
      city: "Pune",
      centreType: "coaching",
      acceptedTerms: true,
    });
    expect(onSignedUp).toHaveBeenCalledWith(session);
  });

  it("names every field at fault before sending anything, and moves to the first", async () => {
    const { user } = setup();
    await user.clear(await screen.findByLabelText("Your name"));
    await user.type(screen.getByLabelText("Mobile number"), "12345");

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(registerOwner).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your name")).toHaveAccessibleDescription("Enter your name.");
    expect(screen.getByLabelText("Mobile number")).toHaveAccessibleDescription("Enter a 10-digit Indian mobile number.");
    expect(screen.getByLabelText("Centre name")).toHaveAccessibleDescription("Enter your centre’s name.");
    expect(screen.getByText("Pick the type of centre.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Accept the terms and privacy notice to continue.");
    expect(screen.getByLabelText("Your name")).toHaveFocus();
  });

  it("shows the server's message for a field", async () => {
    vi.mocked(registerOwner).mockRejectedValue(
      new ApiRequestError(400, "invalid_request", "x", { fields: { city: "Keep the city to 60 characters or fewer." } }),
    );
    const { user } = setup();
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByLabelText("City")).toHaveAccessibleDescription("Keep the city to 60 characters or fewer.");
  });

  it("explains a Google account that already has a Chukta account", async () => {
    vi.mocked(registerOwner).mockRejectedValue(new ApiRequestError(409, "google_in_use", "x"));
    const { user } = setup();
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This Google account already has a Chukta account. Sign in instead.");
  });

  it("goes back to sign-in when there is no Google sign-in to finish", async () => {
    vi.mocked(getGooglePending).mockRejectedValue(new ApiRequestError(404, "google_pending_missing", "x"));
    const { onExpired } = setup();

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
  });

  it("goes back to sign-in when the Google sign-in expires before the form is sent", async () => {
    vi.mocked(registerOwner).mockRejectedValue(new ApiRequestError(401, "google_pending_missing", "x"));
    const { user, onExpired } = setup();
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(onExpired).toHaveBeenCalled();
  });

  it("says when Chukta can't be reached", async () => {
    vi.mocked(getGooglePending).mockRejectedValue(new ApiRequestError(0, "network_error", "x"));
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Chukta. Check your connection and try again.");
  });
});
