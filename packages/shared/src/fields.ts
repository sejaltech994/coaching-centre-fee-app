import { z } from "zod";
import { INVALID_PHONE_MESSAGE, normalizeIndianMobile } from "./phone";

/** Building blocks for the forms' rules, so the web app and the API give the same messages. */

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };

/** Parses `input`; on failure, one message per field at fault. */
export function check<T>(schema: z.ZodType<T>, input: unknown): Validation<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return { ok: false, fields };
}

/** Required text, trimmed, at most `max` characters. */
export const text = (missing: string, max: number, tooLong: string) =>
  z.string({ error: missing }).trim().min(1, missing).max(max, tooLong);

/** Optional text, trimmed, at most `max` characters; empty or missing becomes null. */
export const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((value) => value || null);

/** An Indian mobile number in any common spelling, as E.164. */
export const indianMobile = () =>
  z.string({ error: INVALID_PHONE_MESSAGE }).transform((raw, ctx) => {
    const phone = normalizeIndianMobile(raw);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: INVALID_PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });
