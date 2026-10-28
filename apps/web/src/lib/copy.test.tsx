import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api";
import { copy, errorMessage, withParts } from "./copy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("copy", () => {
  it("is the built-in text when the build baked in none", () => {
    expect(copy.auth.signInTitle).toBe("Sign in");
  });

  it("is the CMS text the build baked in", async () => {
    vi.stubEnv("CHUKTA_COPY", JSON.stringify({ auth: { signInTitle: "Namaste!" } }));
    const fresh = await import("./copy");
    expect(fresh.copy.auth.signInTitle).toBe("Namaste!");
    expect(fresh.copy.auth.continueWithGoogle).toBe("Continue with Google");
  });

  it("falls back to the built-in text if the baked-in copy is unreadable", async () => {
    vi.stubEnv("CHUKTA_COPY", "{not json");
    const fresh = await import("./copy");
    expect(fresh.copy.auth.signInTitle).toBe("Sign in");
  });
});

describe("errorMessage", () => {
  it.each([
    ["network_error", "Can't reach Chukta. Check your connection and try again."],
    ["google_in_use", "This Google account already has a Chukta account. Sign in instead."],
    ["email_in_use", "This email already has a Chukta account that signs in another way. Contact us to move it to Google."],
    ["google_pending_missing", "Your Google sign-in has expired. Continue with Google again."],
  ])("uses the editable text for %s", (code, text) => {
    expect(errorMessage(new ApiRequestError(400, code, "x"))).toBe(text);
  });

  it("shows the server's own message for codes the copy doesn't cover", () => {
    expect(errorMessage(new ApiRequestError(400, "something_new", "Server says no."))).toBe("Server says no.");
  });

  it("is the generic message for anything that isn't an API error", () => {
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});

describe("withParts", () => {
  it("puts elements where the placeholders are", () => {
    render(<p>{withParts("By continuing you agree to {terms} and {privacy}.", { terms: <a href="/terms">Terms</a>, privacy: <a href="/privacy">Privacy</a> })}</p>);

    expect(screen.getByText(/By continuing you agree to/).textContent).toBe("By continuing you agree to Terms and Privacy.");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
