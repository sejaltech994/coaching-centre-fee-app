"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { copy, fill as fillIn } from "@/lib/copy";
import styles from "./auth.module.css";

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** The last code was wrong: every box is marked invalid. */
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * Six one-digit boxes, as on the design's "Enter the code" screen. Typing moves
 * forward, Backspace in an empty box moves back, and a pasted or autofilled code
 * fills every box at once.
 */
export function CodeInput({ value, onChange, invalid, disabled, autoFocus }: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focusBox = (index: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  /** Writes `digits` starting at box `index`, keeping earlier digits. */
  function fill(index: number, digits: string) {
    const next = (value.slice(0, index) + digits).slice(0, LENGTH);
    onChange(next);
    focusBox(next.length);
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // Typing into a box that already holds a digit appends to it; keep the new keystroke.
    fill(index, digits.length === 2 && value[index] ? digits.slice(-1) : digits);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const at = value[index] ? index : index - 1;
      if (at < 0) return;
      onChange(value.slice(0, at));
      focusBox(at);
    } else if (event.key === "ArrowLeft") {
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      focusBox(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    event.preventDefault();
    if (digits) fill(index, digits);
  }

  return (
    <fieldset className={styles.codeGroup} disabled={disabled}>
      <legend className={styles.label}>{copy.auth.codeLabel}</legend>
      <div className={styles.codeBoxes}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            className={styles.codeBox}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={fillIn(copy.auth.digitLabel, { n: i + 1 })}
            aria-invalid={invalid ? true : undefined}
            value={value[i] ?? ""}
            // Selecting on focus lets a typed digit replace the one in the box.
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            autoFocus={autoFocus && i === 0}
          />
        ))}
      </div>
    </fieldset>
  );
}
