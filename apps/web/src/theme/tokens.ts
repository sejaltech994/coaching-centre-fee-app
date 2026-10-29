/**
 * Chukta design-system values (the "Chukta" design system on claude.ai), copied
 * here once. The only file in the web app allowed to hold colour values: screens
 * use the theme's names for them (see theme.ts).
 */

type Pair = { light: string; dark: string };
const pair = (light: string, dark: string): Pair => ({ light, dark });

export const tokens = {
  color: {
    /** Page background. */
    paper: pair("#FBF6EC", "#14151F"),
    /** Cards, menus, inputs. */
    paperRaised: pair("#FFFFFF", "#1D1F2E"),
    /** Alternate bands and table stripes. */
    paperSunk: pair("#F3ECDD", "#0F1018"),
    /** Hairlines, card and input borders. */
    line: pair("#E6DCC8", "#2E3147"),
    ink: pair("#16182B", "#F4EFE4"),
    inkMuted: pair("#5C586C", "#ABA7BA"),
    /** Brand primary: primary buttons, links, active states, focus ring. */
    indigo: pair("#2B2F77", "#A9AEFF"),
    onIndigo: pair("#FFFFFF", "#14151F"),
    indigoSoft: pair("#E7E8F8", "#252852"),
    /** Dark hero, footer and sign-in panels. */
    indigoDeep: pair("#1B1E52", "#0B0C1C"),
    onDeep: pair("#F4EFE4", "#F4EFE4"),
    /** Brand accent. A fill only, never text on paper. */
    marigold: pair("#F2A33A", "#F5B358"),
    marigoldSoft: pair("#FDEFD6", "#3A2A12"),
    paid: pair("#1E7A50", "#5DD39E"),
    paidSoft: pair("#DFF2E7", "#123021"),
    overdue: pair("#B4233C", "#FF8A9A"),
    overdueSoft: pair("#FBE3E6", "#3A1419"),
    pending: pair("#8A5A00", "#F5C26B"),
  },
  /** Families come from next/font (app/layout.tsx), which sets these variables. */
  font: {
    display: 'var(--font-fraunces), "Fraunces", Georgia, "Times New Roman", serif',
    sans: 'var(--font-manrope), "Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
  },
  radius: { sm: 6, md: 10, lg: 16, xl: 28, pill: 999 },
  shadow: {
    card: "0 1px 2px rgba(22,24,43,0.06), 0 8px 24px rgba(22,24,43,0.08)",
    float: "0 24px 60px rgba(27,30,82,0.22)",
  },
} as const;
