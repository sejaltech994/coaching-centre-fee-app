import { z } from "zod";
import { check, indianMobile, text, type Validation } from "./fields";
import type { IndianMobile } from "./phone";

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

const profileSchema = z.object({
  fullName: text("Enter your name.", 80, "Keep your name to 80 characters or fewer."),
  centreName: text("Enter your centre’s name.", 100, "Keep the centre’s name to 100 characters or fewer."),
  city: text("Enter your city.", 60, "Keep the city to 60 characters or fewer."),
  centreType: z.enum(CENTRE_TYPES, { error: "Pick the type of centre." }),
  phone: indianMobile(),
  acceptedTerms: z.literal(true, { error: "Accept the terms and privacy notice to continue." }),
});

export type ProfileValidation = Validation<ProfileInput>;

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
