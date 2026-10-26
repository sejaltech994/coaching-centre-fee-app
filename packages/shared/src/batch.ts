import { z } from "zod";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** A batch as the owner enters it. Shared so the form and the API give the same messages. */
export type BatchInput = {
  name: string;
  subject: string | null;
  days: Weekday[];
  /** 24-hour "HH:MM" in the centre's timezone. */
  startTime: string;
  endTime: string;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeMessage = "Use a 24-hour time like 16:30.";

const batchSchema = z
  .object({
    name: z
      .string({ error: "Give the batch a name." })
      .trim()
      .min(1, "Give the batch a name.")
      .max(80, "Keep the name to 80 characters or fewer."),
    subject: z
      .string()
      .trim()
      .max(80, "Keep the subject to 80 characters or fewer.")
      .nullish()
      .transform((s) => s || null),
    days: z
      .array(z.enum(WEEKDAYS, { error: "Pick at least one day." }), { error: "Pick at least one day." })
      .min(1, "Pick at least one day.")
      .transform((days) => WEEKDAYS.filter((day) => days.includes(day))),
    startTime: z.string({ error: timeMessage }).regex(TIME, timeMessage),
    endTime: z.string({ error: timeMessage }).regex(TIME, timeMessage),
  })
  .superRefine((batch, ctx) => {
    // "HH:MM" strings compare correctly as text.
    if (TIME.test(batch.startTime) && TIME.test(batch.endTime) && batch.endTime <= batch.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "The batch must end after it starts." });
    }
  });

export type BatchValidation = { ok: true; value: BatchInput } | { ok: false; fields: Record<string, string> };

/** Checks and normalises a batch. On failure, one message per field at fault. */
export function validateBatch(input: unknown): BatchValidation {
  const parsed = batchSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "batch");
    fields[field] ??= issue.message;
  }
  return { ok: false, fields };
}

// Display formats follow the Batches design canvas.

/** ["fri", "mon"] → "Mon · Fri" */
export function formatDays(days: readonly string[]): string {
  return WEEKDAYS.filter((day) => days.includes(day))
    .map((day) => WEEKDAY_LABELS[day])
    .join(" · ");
}

function clock12h(time: string): { text: string; period: "am" | "pm" } {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return { text: `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}`, period: hours < 12 ? "am" : "pm" };
}

/** "17:00", "18:30" → "5:00–6:30 pm"; the period is written once when both ends share it. */
export function formatTimeRange(start: string, end: string): string {
  const from = clock12h(start);
  const to = clock12h(end);
  return from.period === to.period
    ? `${from.text}–${to.text} ${to.period}`
    : `${from.text} ${from.period}–${to.text} ${to.period}`;
}

/** "Mon · Wed · Fri · 5:00–6:30 pm", for cards. */
export function formatBatchSchedule(batch: { days: readonly string[]; startTime: string; endTime: string }): string {
  return `${formatDays(batch.days)} · ${formatTimeRange(batch.startTime, batch.endTime)}`;
}
