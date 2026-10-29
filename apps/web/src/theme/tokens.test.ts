import { describe, expect, it } from "vitest";
import { tokens } from "./tokens";

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  const text = ["ink", "inkMuted", "indigo", "paid", "overdue", "pending"] as const;
  const surfaces = ["paper", "paperRaised"] as const;

  it.each(["light", "dark"] as const)("keep every text colour readable on paper in %s mode (4.5:1)", (mode) => {
    for (const fg of text) {
      for (const bg of surfaces) {
        expect(contrast(tokens.color[fg][mode], tokens.color[bg][mode]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(["light", "dark"] as const)("keep text readable on the indigo and deep bands in %s mode", (mode) => {
    const c = tokens.color;
    expect(contrast(c.onIndigo[mode], c.indigo[mode])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onDeep[mode], c.indigoDeep[mode])).toBeGreaterThanOrEqual(4.5);
  });
});
