import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingPage from "./page";

describe("Landing page", () => {
  it("leads with the promise and both calls to action", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Stop chasing fees. Get them settled.");
    expect(screen.getByRole("link", { name: "Start free — up to 25 students" })).toHaveAttribute("href", "#start");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how");
  });

  it("describes the reminder conversation for screen readers", () => {
    render(<LandingPage />);

    expect(screen.getByRole("img", { name: /whatsapp reminder with a upi link/i })).toBeInTheDocument();
  });

  it("has every section the navigation links to", () => {
    const { container } = render(<LandingPage />);

    for (const id of ["top", "how", "features", "pricing", "start"]) {
      expect(container.querySelector(`#${id}`), `#${id}`).not.toBeNull();
    }
  });

  it("strikes off each notebook habit against what replaces it", () => {
    render(<LandingPage />);
    const ledger = screen.getByRole("table", { name: "Before and after Chukta" });

    // Header row + 4 entries.
    expect(within(ledger).getAllByRole("row")).toHaveLength(5);
    expect(within(ledger).getByText("A few fees quietly never get paid")).toHaveClass("before");
  });

  it("lists the three steps in order", () => {
    render(<LandingPage />);
    const steps = within(document.getElementById("how")!).getAllByRole("heading", { level: 3 });

    expect(steps.map((step) => step.textContent)).toEqual([
      "Add your students",
      "Reminders go out",
      "Marked paid, receipt sent",
    ]);
  });

  it("shows both plans with their prices", () => {
    render(<LandingPage />);
    const pricing = within(document.getElementById("pricing")!);

    expect(pricing.getByText("₹0")).toBeInTheDocument();
    expect(pricing.getByText("₹499")).toBeInTheDocument();
    expect(pricing.getByRole("link", { name: "Go Pro" })).toHaveAttribute("href", "#start");
  });

  it("sends new owners to sign in with Google", () => {
    render(<LandingPage />);
    const start = within(document.getElementById("start")!);

    expect(start.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/login");
    expect(start.queryByLabelText("Mobile number")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in with Google · no card · live in 15 minutes/)).toBeInTheDocument();
  });

  it("links to the legal and contact pages in the footer", () => {
    render(<LandingPage />);
    const footer = screen.getByRole("navigation", { name: "Footer" });

    expect(within(footer).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/privacy",
      "/terms",
      "/contact",
    ]);
  });
});
