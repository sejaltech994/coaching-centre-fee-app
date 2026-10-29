import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { AuthShell } from "./AuthShell";

const renderShell = (props: Partial<Parameters<typeof AuthShell>[0]> = {}) =>
  render(
    <ThemeRegistry>
      <AuthShell {...props}>
        <h1>Sign in</h1>
      </AuthShell>
    </ThemeRegistry>,
  );

describe("AuthShell", () => {
  it("puts the form in the page's main region, beside the brand panel", () => {
    renderShell();
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Sign in" }));
    expect(screen.getByRole("complementary")).toHaveTextContent("Fees, settled.");
  });

  it("links the brand home, on the panel and on phones", () => {
    renderShell();
    const home = screen.getAllByRole("link", { name: /Chukta/ });
    expect(home).toHaveLength(2);
    for (const link of home) expect(link).toHaveAttribute("href", "/");
  });

  it("lets each screen set the panel's promise", () => {
    renderShell({ promise: "Almost there.", pitch: "Confirm your email and your centre is ready to go." });
    expect(screen.getByRole("complementary")).toHaveTextContent("Almost there.");
    expect(screen.getByRole("complementary")).toHaveTextContent("Confirm your email and your centre is ready to go.");
  });
});
