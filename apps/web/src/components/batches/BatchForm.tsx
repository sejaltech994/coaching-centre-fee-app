"use client";

import { validateBatch, WEEKDAYS, type BatchInput, type Weekday } from "@chukta/shared";
import { useState, type FormEvent } from "react";
import app from "../app/app.module.css";
import styles from "./batches.module.css";

const DAY_NAMES: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// Errors are shown one at a time, in the order the fields appear.
const FIELD_ORDER = ["name", "subject", "days", "startTime", "endTime"];

type Props = {
  /** The batch being edited; empty for a new one. */
  initial?: BatchInput;
  submitLabel: string;
  onSave: (input: BatchInput) => Promise<void>;
};

/** The design's "New batch" form: name, optional subject, class days and timing. */
export function BatchForm({ initial, submitLabel, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [days, setDays] = useState<Weekday[]>(initial?.days ?? []);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "17:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "18:30");
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: Weekday) =>
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validateBatch({ name, subject, days, startTime, endTime });
    if (!checked.ok) {
      const field = FIELD_ORDER.find((f) => checked.fields[f]) ?? Object.keys(checked.fields)[0]!;
      setError({ field, message: checked.fields[field]! });
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(checked.value);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const invalid = (field: string) => (error?.field === field ? true : undefined);

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="batch-name" className={styles.label}>
          Batch name
        </label>
        <input
          id="batch-name"
          className={styles.input}
          placeholder="e.g. Class 10 Maths"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={invalid("name")}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="batch-subject" className={styles.label}>
          Subject <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="batch-subject"
          className={styles.input}
          placeholder="e.g. Mathematics"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-invalid={invalid("subject")}
        />
      </div>

      <fieldset className={styles.days} aria-invalid={invalid("days")}>
        <legend className={styles.label}>Class days</legend>
        <div className={styles.dayGrid}>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={styles.day}
              aria-pressed={days.includes(day)}
              aria-label={DAY_NAMES[day]}
              onClick={() => toggleDay(day)}
            >
              {DAY_NAMES[day][0]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.times}>
        <div className={styles.field}>
          <label htmlFor="batch-start" className={styles.label}>
            Starts
          </label>
          <input
            id="batch-start"
            className={styles.input}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-invalid={invalid("startTime")}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="batch-end" className={styles.label}>
            Ends
          </label>
          <input
            id="batch-end"
            className={styles.input}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-invalid={invalid("endTime")}
          />
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      <button className={`${app.primaryButton} ${styles.submit}`} type="submit" disabled={saving}>
        {submitLabel}
      </button>
    </form>
  );
}
