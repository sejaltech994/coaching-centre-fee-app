import { authIdentities, centres, consents, users, type Centre, type User } from "@chukta/db";
import type { ProfileInput } from "@chukta/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Deps } from "../../deps";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import type { PendingGoogle } from "./google";

/** Version of the terms and privacy notice shown on sign-up; recorded with each consent. */
export const TERMS_VERSION = "2026-10";

/**
 * Signs up the Google account waiting in the sign-in cookie: the owner, their
 * centre, the consent record and the Google link, together or not at all.
 * Google has confirmed the email; the mobile number waits for its own code.
 */
export async function register(
  deps: Deps,
  input: { google: PendingGoogle; profile: ProfileInput; ip: string; userAgent?: string },
): Promise<{ user: User; centre: Centre }> {
  const { google, profile } = input;
  const now = deps.now();

  try {
    return await deps.db.transaction(async (tx) => {
      const linked = await tx.query.authIdentities.findFirst({
        where: and(eq(authIdentities.provider, "google"), eq(authIdentities.subject, google.sub)),
      });
      if (linked) throw googleInUse();
      if (await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${google.email}` })) throw emailInUse();

      const [centre] = await tx
        .insert(centres)
        .values({ ownerPhone: profile.phone, name: profile.centreName, city: profile.city, centreType: profile.centreType })
        .returning();
      const [user] = await tx
        .insert(users)
        .values({
          centreId: centre!.id,
          phone: profile.phone,
          name: profile.fullName,
          email: google.email,
          emailVerifiedAt: now,
          lastLoginAt: now,
        })
        .returning();
      await tx.insert(consents).values({
        userId: user!.id,
        kind: "terms_and_privacy",
        version: TERMS_VERSION,
        ip: input.ip,
        userAgent: input.userAgent,
        acceptedAt: now,
      });
      await tx.insert(authIdentities).values({
        userId: user!.id,
        provider: "google",
        subject: google.sub,
        email: google.email,
        pictureUrl: google.picture,
        lastUsedAt: now,
      });
      return { user: user!, centre: centre! };
    });
  } catch (err) {
    // The same Google account or email signing up twice at once.
    if (!isUniqueViolation(err)) throw err;
    throw constraintOf(err)?.includes("email") ? emailInUse() : googleInUse();
  }
}

const googleInUse = () =>
  new ApiError(409, "google_in_use", "This Google account already has a Chukta account. Sign in instead.");

export const emailInUse = () =>
  new ApiError(409, "email_in_use", "This email already has a Chukta account that signs in another way.");

/** The violated constraint's name, however the driver wraps the error. */
function constraintOf(err: unknown): string | undefined {
  const name = (e: unknown) => (e as { constraint?: string } | undefined)?.constraint;
  return name(err) ?? name((err as { cause?: unknown } | undefined)?.cause);
}
