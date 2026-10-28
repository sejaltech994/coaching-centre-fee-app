import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each screen must take its words from the CMS copy baked into the build, not from code.
const cms = {
  auth: {
    promise: "Fees, sorted.",
    signInTitle: "Namaste! Sign in",
    continueWithGoogle: "Sign in with Google",
    legalNotice: "Continuing means you accept the {terms} and the {privacy}.",
    termsLink: "Terms of use",
  },
  profile: { title: "About your centre", phone: "WhatsApp number", submit: "Start using Chukta", typeDance: "Dance academy" },
};

beforeEach(() => {
  vi.stubEnv("CHUKTA_COPY", JSON.stringify(cms));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("editable copy", () => {
  it("shows the CMS wording on the side panel", async () => {
    const { AuthShell } = await import("./AuthShell");
    render(<AuthShell>form</AuthShell>);
    expect(screen.getByText("Fees, sorted.")).toBeInTheDocument();
  });

  it("shows the CMS wording on sign-in", async () => {
    const { SignIn } = await import("./SignIn");
    render(<SignIn googleEnabled />);

    expect(screen.getByRole("heading", { name: "Namaste! Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText(/Continuing means you accept the/)).toBeInTheDocument();
  });

  it("shows the CMS wording on sign-up", async () => {
    const api = await import("@/lib/api");
    vi.spyOn(api, "getGooglePending").mockResolvedValue({ email: "asha@example.com", name: "Asha" });
    const { SignUpForm } = await import("./SignUpForm");
    render(<SignUpForm onSignedUp={vi.fn()} onExpired={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "About your centre" })).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dance academy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start using Chukta" })).toBeInTheDocument();
  });
});
