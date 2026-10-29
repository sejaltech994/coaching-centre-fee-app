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
});
