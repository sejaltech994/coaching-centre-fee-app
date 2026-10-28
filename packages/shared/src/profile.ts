import { z } from "zod";
import { INVALID_PHONE_MESSAGE, normalizeIndianMobile, type IndianMobile } from "./phone";

/** Centre types from the TSD (Registration, login and profile). */
export const CENTRE_TYPES = ["tuition", "coaching", "dance", "music", "sports", "other"] as const;
export type CentreType = (typeof CENTRE_TYPES)[number];

export const CENTRE_TYPE_LABELS: Record<CentreType, string> = {
  tuition: "Tuition",
  coaching: "Coaching",
  dance: "Dance",
  music: "Music",
  sports: "Sports",
  other: "Other",
};

/**
 * What a new owner enters after Google sign-in. Shared so the form and the API
 * give the same messages. Their email is Google's, so it isn't asked for.
 */
export type ProfileInput = {
  fullName: string;
  /** For WhatsApp reminders; confirmed later by a code. */
  phone: IndianMobile;
  centreName: string;
  city: string;
  centreType: CentreType;
};

const text = (missing: string, max: number, tooLong: string) =>
  z.string({ error: missing }).trim().min(1, missing).max(max, tooLong);

const profileSchema = z.object({
  fullName: text("Enter your name.", 80, "Keep your name to 80 characters or fewer."),
  centreName: text("Enter your centre’s name.", 100, "Keep the centre’s name to 100 characters or fewer."),
  city: text("Enter your city.", 60, "Keep the city to 60 characters or fewer."),
  centreType: z.enum(CENTRE_TYPES, { error: "Pick the type of centre." }),
  phone: z
    .string({ error: INVALID_PHONE_MESSAGE })
    .transform((raw, ctx) => {
      const phone = normalizeIndianMobile(raw);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: INVALID_PHONE_MESSAGE });
        return z.NEVER;
      }
      return phone;
    }),
  acceptedTerms: z.literal(true, { error: "Accept the terms and privacy notice to continue." }),
});

type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };
export type ProfileValidation = Validation<ProfileInput>;

/** Parses `input`; on failure, one message per field at fault. */
function check<T>(schema: z.ZodType<T>, input: unknown): Validation<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "profile");
    fields[field] ??= issue.message;
  }
  return { ok: false, fields };
}

/** Checks and normalises a sign-up. */
export function validateProfile(input: unknown): ProfileValidation {
  const checked = check(profileSchema, input);
  if (!checked.ok) return checked;
  const { acceptedTerms: _accepted, ...value } = checked.value;
  return { ok: true, value };
}

export type OwnerInput = Pick<ProfileInput, "fullName">;
export type CentreInput = Pick<ProfileInput, "centreName" | "city" | "centreType">;

/** The owner's own details, as edited in Settings; same rules as sign-up. */
export const validateOwner = (input: unknown): Validation<OwnerInput> =>
  check(profileSchema.pick({ fullName: true }), input);

/** The centre's details, as edited in Settings; same rules as sign-up. */
export const validateCentre = (input: unknown): Validation<CentreInput> =>
  check(profileSchema.pick({ centreName: true, city: true, centreType: true }), input);
