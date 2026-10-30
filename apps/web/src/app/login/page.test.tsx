import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

let search = new URLSearchParams();

vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

beforeEach(() => {
  search = new URLSearchParams();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_SIGN_IN", "on");
});

afterEach(() => vi.unstubAllEnvs());

describe("/login", () => {
  it("offers Google when the build turns it on", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("offers no way in when it doesn't", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SIGN_IN", "");
    render(<LoginPage />);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("shows why Google sent the owner back", () => {
    search = new URLSearchParams({ google_error: "cancelled" });
    render(<LoginPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Google sign-in was cancelled.");
  });

  it("says why the owner has to log in", () => {
    search = new URLSearchParams({ session: "expired" });
    render(<LoginPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Your login has expired. Log in to continue.");
  });

  it("remembers where to go back to after signing in", () => {
    search = new URLSearchParams({ session: "required", next: "/fees/" });
    render(<LoginPage />);
    expect(window.sessionStorage.getItem("chukta.returnTo")).toBe("/fees/");
    window.sessionStorage.clear();
  });
});
