import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

function renderHeader() {
  render(
    <>
      <SiteHeader />
      <p>Page content outside the header</p>
    </>,
  );
  return {
    menuButton: () => screen.getByRole("button", { name: /menu/i }),
    nav: () => screen.getByRole("navigation", { name: "Main" }),
  };
}

describe("SiteHeader", () => {
  it("links to every section, log in and sign up", () => {
    const { nav } = renderHeader();
    const hrefs = Array.from(nav().querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#how", "#features", "#pricing", "/login", "#start"]);
    expect(screen.getByRole("link", { name: /chukta/i })).toHaveAttribute("href", "#top");
  });

  it("opens and closes the mobile menu from the menu button", async () => {
    const user = userEvent.setup();
    const { menuButton, nav } = renderHeader();

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(menuButton()).toHaveAccessibleName("Open menu");
    expect(nav()).not.toHaveClass("navOpen");

    await user.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(menuButton()).toHaveAccessibleName("Close menu");
    expect(nav()).toHaveClass("navOpen");

    await user.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu when a link is chosen", async () => {
    const user = userEvent.setup();
    const { menuButton, nav } = renderHeader();

    await user.click(menuButton());
    await user.click(screen.getByRole("link", { name: "Pricing" }));
    expect(nav()).not.toHaveClass("navOpen");
  });

  it("closes the menu on Escape but not on other keys", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderHeader();

    await user.click(menuButton());
    // A key that does nothing on the focused menu button (Enter or Space would toggle it).
    await user.keyboard("{Shift}");
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu on a tap outside the header, not inside it", async () => {
    const user = userEvent.setup();
    const { menuButton, nav } = renderHeader();

    await user.click(menuButton());
    fireEvent.pointerDown(nav());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(screen.getByText("Page content outside the header"));
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });
});
