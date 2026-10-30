import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigate } from "@/lib/navigate";
import { SignIn } from "./SignIn";

vi.mock("@/lib/navigate", () => ({ navigate: vi.fn() }));

beforeEach(() => vi.mocked(navigate).mockReset());

describe("SignIn", () => {
  it("offers Google as the one way in, for new and returning owners", async () => {
    const user = userEvent.setup();
    render(<SignIn googleEnabled />);

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText(/New here\? Continuing with Google creates your account\./)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Continue with Google"]);
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(navigate).toHaveBeenCalledWith("http://localhost:8787/api/v1/auth/google/start");
  });

  it("links the terms and privacy notice", () => {
    render(<SignIn googleEnabled />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");
  });

  it("says sign-in isn't available when this build has no Google client", () => {
    render(<SignIn googleEnabled={false} />);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in isn’t available right now.");
  });

  it.each([
    ["cancelled", "Google sign-in was cancelled. Try again when you’re ready."],
    ["email_unverified", "Google hasn’t verified this email. Use another Google account."],
    ["unavailable", "Sign-in isn’t available right now. Try again later."],
    ["expired", "Your Google sign-in has expired. Continue with Google again."],
    ["email_in_use", "This email already has a Chukta account that signs in another way. Contact us to move it to Google."],
    ["failed", "Google sign-in didn’t work. Try again."],
    ["anything-else", "Google sign-in didn’t work. Try again."],
  ])("explains a sign-in that came back %s, and offers Google again", (googleError, message) => {
    render(<SignIn googleEnabled googleError={googleError} />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it.each([
    ["required", "Log in to continue."],
    ["expired", "Your login has expired. Log in to continue."],
    ["deleted", "Your account will be deleted in 30 days. Sign in before then to keep it."],
  ])("explains a ?session=%s redirect", (session, message) => {
    render(<SignIn googleEnabled session={session} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says nothing for a session reason it doesn't know", () => {
    render(<SignIn googleEnabled session="whatever" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
