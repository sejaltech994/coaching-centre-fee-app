import { z } from "zod";

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

/** What a new owner enters on profile setup. Shared so the form and the API give the same messages. */
export type ProfileInput = {
  fullName: string;
  centreName: string;
  city: string;
  centreType: CentreType;
  /** Lower-cased; null when not given. */
  email: string | null;
};

const text = (missing: string, max: number, tooLong: string) =>
  z.string({ error: missing }).trim().min(1, missing).max(max, tooLong);

const profileSchema = z.object({
  fullName: text("Enter your name.", 80, "Keep your name to 80 characters or fewer."),
  centreName: text("Enter your centre’s name.", 100, "Keep the centre’s name to 100 characters or fewer."),
  city: text("Enter your city.", 60, "Keep the city to 60 characters or fewer."),
  centreType: z.enum(CENTRE_TYPES, { error: "Pick the type of centre." }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email({ error: "Enter a valid email address." }).max(254)]))
    .nullish()
    .transform((e) => e || null),
  acceptedTerms: z.literal(true, { error: "Accept the terms and privacy notice to continue." }),
});

export type ProfileValidation = { ok: true; value: ProfileInput } | { ok: false; fields: Record<string, string> };

/** Checks and normalises a profile. On failure, one message per field at fault. */
export function validateProfile(input: unknown): ProfileValidation {
  const parsed = profileSchema.safeParse(input);
  if (parsed.success) {
    const { acceptedTerms: _accepted, ...value } = parsed.data;
    return { ok: true, value };
  }

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "profile");
    fields[field] ??= issue.message;
  }
  return { ok: false, fields };
}
