import { createTheme, type PaletteOptions } from "@mui/material/styles";
import "./mui.d";
import { tokens } from "./tokens";

/**
 * The one Chukta theme (TSD: UI components and theming). Screens take colours,
 * type, corners and shadows from here by name and never set their own.
 */

type Mode = "light" | "dark";

function palette(mode: Mode): PaletteOptions {
  const c = Object.fromEntries(Object.entries(tokens.color).map(([name, value]) => [name, value[mode]])) as Record<
    keyof typeof tokens.color,
    string
  >;
  return {
    mode,
    primary: { main: c.indigo, contrastText: c.onIndigo, light: c.indigoSoft },
    error: { main: c.overdue, light: c.overdueSoft },
    success: { main: c.paid, light: c.paidSoft },
    warning: { main: c.pending, light: c.marigoldSoft },
    info: { main: c.indigo, light: c.indigoSoft },
    paid: { main: c.paid, light: c.paidSoft, contrastText: c.onIndigo },
    pending: { main: c.pending, light: c.marigoldSoft, contrastText: c.onIndigo },
    overdue: { main: c.overdue, light: c.overdueSoft, contrastText: c.onIndigo },
    accent: { main: c.marigold, light: c.marigoldSoft, contrastText: c.ink },
    deep: { main: c.indigoDeep, contrastText: c.onDeep },
    background: { default: c.paper, paper: c.paperRaised, sunk: c.paperSunk },
    text: { primary: c.ink, secondary: c.inkMuted },
    divider: c.line,
  };
}

const display = (fontSize: number, lineHeight: number, letterSpacing: string) => ({
  fontFamily: tokens.font.display,
  fontSize: `${fontSize}px`,
  lineHeight: `${lineHeight}px`,
  fontWeight: 600,
  letterSpacing,
});

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class", cssVarPrefix: "ck" },
  colorSchemes: { light: { palette: palette("light") }, dark: { palette: palette("dark") } },
  // MUI's 8 px unit: spacing(0.5) is Chukta's 4 px step.
  spacing: 8,
  shape: { borderRadius: tokens.radius.md },
  typography: {
    fontFamily: tokens.font.sans,
    h1: display(64, 68, "-0.02em"),
    h2: display(44, 50, "-0.015em"),
    h3: display(30, 36, "-0.01em"),
    h4: { fontSize: "20px", lineHeight: "28px", fontWeight: 700 },
    bodyLg: { fontSize: "18px", lineHeight: "28px" },
    body1: { fontSize: "16px", lineHeight: "24px" },
    body2: { fontSize: "14px", lineHeight: "20px" },
    button: { fontSize: "16px", lineHeight: "24px", fontWeight: 700, textTransform: "none" },
    caption: { fontSize: "13px", lineHeight: "18px", fontWeight: 500 },
    overline: { fontSize: "12px", lineHeight: "16px", fontWeight: 700, letterSpacing: "0.08em" },
    amount: { fontSize: "28px", lineHeight: "32px", fontWeight: 800, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // The Chukta focus ring, for every focusable element.
        ":focus-visible": { outline: "2px solid var(--ck-palette-primary-main)", outlineOffset: "2px" },
      },
    },
    MuiTypography: { defaultProps: { variantMapping: { bodyLg: "p", amount: "span" } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: "none", minHeight: 44 } },
    },
    MuiTextField: { defaultProps: { variant: "outlined", fullWidth: true } },
    MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { borderRadius: tokens.radius.lg } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: tokens.radius.lg, boxShadow: tokens.shadow.float } } },
    MuiChip: { defaultProps: { size: "small" } },
  },
});
