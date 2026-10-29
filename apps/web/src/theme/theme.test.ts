import type { Palette } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { theme } from "./theme";
import { tokens } from "./tokens";

// A theme made with cssVariables keeps both schemes; MUI's Theme type doesn't say so.
const { light, dark } = Object.fromEntries(
  Object.entries((theme as unknown as { colorSchemes: Record<string, { palette: Palette }> }).colorSchemes).map(
    ([mode, scheme]) => [mode, scheme.palette],
  ),
);

describe("the Chukta theme", () => {
  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("takes its %s colours from the design system", (mode, palette) => {
    const c = (name: keyof typeof tokens.color) => tokens.color[name][mode];
    expect(palette.primary.main).toBe(c("indigo"));
    expect(palette.primary.contrastText).toBe(c("onIndigo"));
    expect(palette.background.default).toBe(c("paper"));
    expect(palette.background.paper).toBe(c("paperRaised"));
    expect(palette.background.sunk).toBe(c("paperSunk"));
    expect(palette.text.primary).toBe(c("ink"));
    expect(palette.text.secondary).toBe(c("inkMuted"));
    expect(palette.divider).toBe(c("line"));
    expect(palette.error.main).toBe(c("overdue"));
    expect(palette.success.main).toBe(c("paid"));
    expect(palette.paid.main).toBe(c("paid"));
    expect(palette.paid.light).toBe(c("paidSoft"));
    expect(palette.overdue.main).toBe(c("overdue"));
    expect(palette.overdue.light).toBe(c("overdueSoft"));
    expect(palette.pending.main).toBe(c("pending"));
    expect(palette.accent.main).toBe(c("marigold"));
    expect(palette.accent.contrastText).toBe(c("ink"));
    expect(palette.deep.main).toBe(c("indigoDeep"));
    expect(palette.deep.contrastText).toBe(c("onDeep"));
  });

  it("exposes colours as ck- CSS variables, switched by a class on <html>", () => {
    expect(theme.vars!.palette.primary.main).toMatch(/^var\(--ck-palette-primary-main\b/);
    expect(theme.vars!.palette.paid.main).toMatch(/^var\(--ck-palette-paid-main\b/);
  });

  it("keeps MUI's 8 px unit, so 0.5 is Chukta's 4 px step, with 10 px corners", () => {
    expect(theme.spacing(0.5)).toBe("calc(0.5 * var(--ck-spacing, 8px))");
    expect(theme.shape.borderRadius).toBe(10);
  });

  it("sets headlines in Fraunces and everything else in Manrope", () => {
    // next/font renames the families, so the theme names them by its CSS variables.
    expect(theme.typography.fontFamily).toMatch(/^var\(--font-manrope\), /);
    expect(theme.typography.h1.fontFamily).toMatch(/^var\(--font-fraunces\), /);
    expect(theme.typography.h3).toMatchObject({ fontSize: "30px", lineHeight: "36px", fontWeight: 600 });
    expect(theme.typography.h4.fontFamily).toBe(theme.typography.fontFamily);
    expect(theme.typography.amount).toMatchObject({ fontSize: "28px", fontWeight: 800, fontVariantNumeric: "tabular-nums" });
    expect(theme.typography.bodyLg).toMatchObject({ fontSize: "18px", lineHeight: "28px" });
  });

  it("gives buttons Chukta's shape: no capitals, no shadow, at least 44 px tall", () => {
    expect(theme.components?.MuiButton?.defaultProps).toMatchObject({ disableElevation: true });
    expect(theme.components?.MuiButton?.styleOverrides?.root).toMatchObject({ textTransform: "none", minHeight: 44 });
  });

  it("draws the Chukta focus ring once, for everything", () => {
    expect(JSON.stringify(theme.components?.MuiCssBaseline?.styleOverrides)).toContain(
      '"outline":"2px solid var(--ck-palette-primary-main)","outlineOffset":"2px"',
    );
  });
});
