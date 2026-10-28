import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OtpInput } from "./OtpInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [code, setCode] = useState(initial);
  return (
    <>
      <OtpInput value={code} onChange={setCode} />
      <output data-testid="code">{code}</output>
    </>
  );
}

const digit = (n: number) => screen.getByLabelText(`Digit ${n}`);
const code = () => screen.getByTestId("code").textContent;

describe("OtpInput", () => {
  it("shows six labelled boxes in a group named for the code", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "6-digit code" })).toBeInTheDocument();
    for (let n = 1; n <= 6; n++) expect(digit(n)).toHaveAttribute("inputmode", "numeric");
    expect(digit(1)).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("moves to the next box as each digit is typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(digit(1));
    await user.keyboard("4829");

    expect(code()).toBe("4829");
    expect(digit(5)).toHaveFocus();
  });

  it("ignores anything that isn't a digit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(digit(1));
    await user.keyboard("a1 b2");

    expect(code()).toBe("12");
  });

  it("goes back a box on Backspace in an empty box, clearing that digit", async () => {
    const user = userEvent.setup();
    render(<Harness initial="482" />);

    await user.click(digit(4));
    await user.keyboard("{Backspace}");

    expect(code()).toBe("48");
    expect(digit(3)).toHaveFocus();
  });

  it("moves between boxes with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness initial="482913" />);

    await user.click(digit(3));
    await user.keyboard("{ArrowLeft}");
    expect(digit(2)).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(digit(4)).toHaveFocus();
  });

  it("fills every box from a pasted code, ignoring spaces", () => {
    render(<Harness />);

    fireEvent.paste(digit(1), { clipboardData: { getData: () => " 482 913 " } });

    expect(code()).toBe("482913");
    for (const [i, ch] of [..."482913"].entries()) expect(digit(i + 1)).toHaveValue(ch);
  });

  it("takes a whole code typed into one box at once, as SMS autofill does", () => {
    render(<Harness />);

    fireEvent.change(digit(1), { target: { value: "482913" } });

    expect(code()).toBe("482913");
  });

  it("marks every box invalid when told the code was wrong", () => {
    render(<OtpInput value="" onChange={() => {}} invalid />);
    for (let n = 1; n <= 6; n++) expect(digit(n)).toHaveAttribute("aria-invalid", "true");
  });
});
