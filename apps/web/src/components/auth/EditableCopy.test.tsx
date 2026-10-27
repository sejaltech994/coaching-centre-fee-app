import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each screen must take its words from the CMS copy baked into the build, not from code.
const cms = {
  auth: {
    promise: "Fees, sorted.",
    welcomeTitle: "Namaste! Welcome to Chukta",
    continueWithMobile: "Use my mobile number",
    legalNotice: "Continuing means you accept the {terms} and the {privacy}.",
    termsLink: "Terms of use",
    phoneTitle: "What's your number?",
    sendCode: "Text me a code",
    codeTitle: "Type the code",
    codeSentTo: "We texted {phone}.",
    digitLabel: "Box {n}",
    verify: "Check code",
  },
  profile: { title: "Tell us about your centre", submit: "Start using Chukta", typeDance: "Dance academy" },
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

  it("shows the CMS wording through welcome, mobile number and code", async () => {
    const api = await import("@/lib/api");
    vi.spyOn(api, "requestOtp").mockResolvedValue({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    const { LoginFlow } = await import("./LoginFlow");
    const user = userEvent.setup();
    render(<LoginFlow onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Namaste! Welcome to Chukta" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText(/Continuing means you accept the/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use my mobile number" }));
    expect(screen.getByRole("heading", { name: "What's your number?" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: "Text me a code" }));

    expect(await screen.findByRole("heading", { name: "Type the code" })).toBeInTheDocument();
    expect(screen.getByText(/We texted \+91 98765 43210\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Box 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check code" })).toBeInTheDocument();
  });

  it("shows the CMS wording on profile setup", async () => {
    const { ProfileSetup } = await import("./ProfileSetup");
    render(<ProfileSetup signupTicket="t" phone="+919876543210" onRegistered={vi.fn()} onStartOver={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Tell us about your centre" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dance academy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start using Chukta" })).toBeInTheDocument();
  });
});
