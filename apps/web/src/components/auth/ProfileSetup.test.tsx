import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, registerOwner, type LoginSession } from "@/lib/api";
import { ProfileSetup } from "./ProfileSetup";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  registerOwner: vi.fn(),
}));

const session: LoginSession = {
  status: "signed_in",
  accessToken: "access-token",
  expiresIn: 900,
  isNewAccount: true,
  user: { id: "u1", phone: "+919876543210", fullName: "Asha Sharma", email: null, role: "owner" },
  centre: { id: "c1", name: "Sunrise Classes", city: "Pune", centreType: "coaching", plan: "free", timezone: "Asia/Kolkata" },
};

function setup() {
  const onRegistered = vi.fn();
  const onStartOver = vi.fn();
  const user = userEvent.setup();
  render(<ProfileSetup signupTicket="ticket-1" phone="+919876543210" onRegistered={onRegistered} onStartOver={onStartOver} />);
  return { user, onRegistered, onStartOver };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>, { terms = true, email = "" } = {}) {
  await user.type(screen.getByLabelText("Your name"), "Asha Sharma");
  await user.type(screen.getByLabelText("Centre name"), "Sunrise Classes");
  await user.type(screen.getByLabelText("City"), "Pune");
  await user.selectOptions(screen.getByLabelText("Type of centre"), "Coaching");
  if (email) await user.type(screen.getByLabelText("Email (optional)"), email);
  if (terms) await user.click(screen.getByRole("checkbox", { name: /I agree to Chukta’s Terms and Privacy notice/ }));
}

beforeEach(() => {
  vi.mocked(registerOwner).mockReset().mockResolvedValue(session);
});

describe("ProfileSetup", () => {
  it("says which number was verified and offers every centre type", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Set up your centre" })).toBeInTheDocument();
    expect(screen.getByText(/\+91 98765 43210 is verified/)).toBeInTheDocument();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose one", "Tuition", "Coaching", "Dance", "Music", "Sports", "Other"]);
  });

  it("links to the terms and the privacy notice", () => {
    setup();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");
  });

  it("registers with the ticket and the trimmed profile", async () => {
    const { user, onRegistered } = setup();
    await fillIn(user, { email: "asha@example.com" });

    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(registerOwner).toHaveBeenCalledWith({
      signupTicket: "ticket-1",
      fullName: "Asha Sharma",
      centreName: "Sunrise Classes",
      city: "Pune",
      centreType: "coaching",
      email: "asha@example.com",
      acceptedTerms: true,
    });
    expect(onRegistered).toHaveBeenCalledWith(session);
  });

  it("asks for the terms to be accepted without calling the API", async () => {
    const { user } = setup();
    await fillIn(user, { terms: false });

    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Accept the terms and privacy notice to continue.");
    expect(registerOwner).not.toHaveBeenCalled();
  });

  it("explains each missing field beside it", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(screen.getByLabelText("Your name")).toHaveAccessibleDescription("Enter your name.");
    expect(screen.getByLabelText("Centre name")).toHaveAccessibleDescription("Enter your centre’s name.");
    expect(screen.getByLabelText("City")).toHaveAccessibleDescription("Enter your city.");
    expect(screen.getByLabelText("Type of centre")).toHaveAccessibleDescription("Pick the type of centre.");
    expect(screen.getByLabelText("Your name")).toHaveFocus();
  });

  it("shows the server's message beside the email when it is taken", async () => {
    vi.mocked(registerOwner).mockRejectedValue(
      new ApiRequestError(409, "email_taken", "Another account uses this email.", {
        fields: { email: "Another account uses this email. Use a different one or leave it blank." },
      }),
    );
    const { user, onRegistered } = setup();
    await fillIn(user, { email: "asha@example.com" });

    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(await screen.findByLabelText("Email (optional)")).toHaveAccessibleDescription(
      "Another account uses this email. Use a different one or leave it blank.",
    );
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it("offers to start again when the sign-up has expired", async () => {
    vi.mocked(registerOwner).mockRejectedValue(
      new ApiRequestError(400, "signup_ticket_invalid", "Your sign-up has expired. Verify your number again."),
    );
    const { user, onStartOver } = setup();
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Create my centre" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-up has expired. Verify your number again.");
    await user.click(screen.getByRole("button", { name: "Verify my number again" }));
    expect(onStartOver).toHaveBeenCalled();
  });
});
