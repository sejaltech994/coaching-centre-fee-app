"use client";

import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { copy, fill as fillIn } from "@/lib/copy";

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
 * Six one-digit boxes (TSD: MUI has no code input, so six TextFields in a Stack).
 * Typing moves forward, Backspace in an empty box moves back, and a pasted or
 * autofilled code fills every box at once.
 */
export function OtpInput({ value, onChange, invalid, disabled, autoFocus }: Props) {
  const t = copy.settings;
  const labelId = useId();
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

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLDivElement>) {
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

  function handlePaste(index: number, event: ClipboardEvent<HTMLDivElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    event.preventDefault();
    if (digits) fill(index, digits);
  }

  return (
    <Stack role="group" aria-labelledby={labelId} spacing={1}>
      <Typography id={labelId} variant="body2" sx={{ fontWeight: 600 }}>
        {t.codeLabel}
      </Typography>
      <Stack direction="row" spacing={1}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <TextField
            key={i}
            inputRef={(el: HTMLInputElement | null) => {
              boxes.current[i] = el;
            }}
            value={value[i] ?? ""}
            error={invalid}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            onChange={(event) => handleChange(i, event.target.value)}
            onKeyDown={(event) => handleKeyDown(i, event)}
            onPaste={(event) => handlePaste(i, event)}
            // Selecting on focus lets a typed digit replace the one in the box.
            onFocus={(event) => event.target.select()}
            fullWidth={false}
            sx={{ width: 48 }}
            slotProps={{
              htmlInput: {
                inputMode: "numeric",
                autoComplete: i === 0 ? "one-time-code" : "off",
                "aria-label": fillIn(t.digitLabel, { n: i + 1 }),
                style: { textAlign: "center", fontSize: 20, fontWeight: 700, padding: "12px 0" },
              },
            }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
