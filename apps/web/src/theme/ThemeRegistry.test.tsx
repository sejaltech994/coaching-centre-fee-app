import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeRegistry } from "./ThemeRegistry";
import { tokens } from "./tokens";

function PaidColour() {
  return <span>{useTheme().palette.paid.main}</span>;
}

describe("ThemeRegistry", () => {
  it("gives every screen the Chukta theme", () => {
    render(
      <ThemeRegistry>
        <PaidColour />
        <Button color="paid">Mark paid</Button>
      </ThemeRegistry>,
    );
    expect(screen.getByText(tokens.color.paid.light)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
  });
});
