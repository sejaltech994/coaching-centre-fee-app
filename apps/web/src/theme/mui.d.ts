import type { CSSProperties } from "react";

/** Chukta's own palette entries and type styles, known to MUI's types. */

declare module "@mui/material/styles" {
  interface Palette {
    paid: Palette["primary"];
    pending: Palette["primary"];
    overdue: Palette["primary"];
    accent: Palette["primary"];
    deep: Palette["primary"];
  }
  interface PaletteOptions {
    paid?: PaletteOptions["primary"];
    pending?: PaletteOptions["primary"];
    overdue?: PaletteOptions["primary"];
    accent?: PaletteOptions["primary"];
    deep?: PaletteOptions["primary"];
  }
  interface TypeBackground {
    /** Alternate bands and table stripes. */
    sunk: string;
  }
  interface TypographyVariants {
    bodyLg: CSSProperties;
    amount: CSSProperties;
  }
  interface TypographyVariantsOptions {
    bodyLg?: CSSProperties;
    amount?: CSSProperties;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    paid: true;
    pending: true;
    overdue: true;
    accent: true;
    deep: true;
  }
}
declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    paid: true;
    pending: true;
    overdue: true;
    accent: true;
    deep: true;
  }
}
declare module "@mui/material/Alert" {
  interface AlertPropsColorOverrides {
    paid: true;
    pending: true;
    overdue: true;
    accent: true;
    deep: true;
  }
}
declare module "@mui/material/LinearProgress" {
  interface LinearProgressPropsColorOverrides {
    paid: true;
    pending: true;
    overdue: true;
    accent: true;
    deep: true;
  }
}
declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    bodyLg: true;
    amount: true;
  }
}
