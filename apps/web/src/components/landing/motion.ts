import type { CSSProperties } from "react";

/** Start offset for the page-load sequence; read by the `rise` and `pop` classes. */
export function delay(ms: number): CSSProperties {
  return { "--delay": `${ms}ms` } as CSSProperties;
}
