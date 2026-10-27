import { centres, consents, signupTickets, users, type Centre, type User } from "@chukta/db";
import type { IndianMobile, ProfileInput } from "@chukta/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Deps } from "../../deps";
import { keyedHash, randomToken } from "../../lib/crypto";
import { ApiError, isUniqueViolation } from "../../lib/errors";

/** How long a verified number may take to finish profile setup. */
export const SIGNUP_TICKET_TTL_SECONDS = 15 * 60;

/** Version of the terms and privacy notice shown on profile setup; recorded with each consent. */
export const TERMS_VERSION = "2026-10";

const hashTicket = (secret: string, ticket: string) => keyedHash(secret, "signup", ticket);

const ticketInvalid = () =>
  new ApiError(400, "signup_ticket_invalid", "Your sign-up has expired. Verify your number again.");

/** Records that `phone` was verified and has no account; the returned ticket lets it register. */
export async function issueSignupTicket(deps: Deps, phone: IndianMobile): Promise<string> {
  const ticket = randomToken();
  await deps.db.insert(signupTickets).values({
    phone,
    tokenHash: hashTicket(deps.config.jwtSecret, ticket),
    expiresAt: new Date(deps.now().getTime() + SIGNUP_TICKET_TTL_SECONDS * 1000),
  });
  return ticket;
}

/**
 * Spends a signup ticket to create the owner, their centre and the consent record
 * together. If anything fails the ticket stays usable, so the owner can fix the form.
 */
export async function register(
  deps: Deps,
  input: { ticket: string; profile: ProfileInput; ip: string; userAgent?: string },
): Promise<{ user: User; centre: Centre }> {
  const { db, config } = deps;
  const now = deps.now();
  const { profile } = input;

  try {
    return await db.transaction(async (tx) => {
      // Conditional on consumed_at still being null, so a ticket can't be spent twice concurrently.
      const [ticket] = await tx
        .update(signupTickets)
        .set({ consumedAt: now })
        .where(
          and(
            eq(signupTickets.tokenHash, hashTicket(config.jwtSecret, input.ticket)),
            isNull(signupTickets.consumedAt),
            gt(signupTickets.expiresAt, now),
          ),
        )
        .returning({ phone: signupTickets.phone });
      if (!ticket) throw ticketInvalid();

      if (await tx.query.users.findFirst({ where: eq(users.phone, ticket.phone) })) throw accountExists();

      const [centre] = await tx
        .insert(centres)
        .values({ ownerPhone: ticket.phone, name: profile.centreName, city: profile.city, centreType: profile.centreType })
        .returning();
      const [user] = await tx
        .insert(users)
        .values({ centreId: centre!.id, phone: ticket.phone, name: profile.fullName, email: profile.email, lastLoginAt: now })
        .returning();
      await tx.insert(consents).values({
        userId: user!.id,
        kind: "terms_and_privacy",
        version: TERMS_VERSION,
        ip: input.ip,
        userAgent: input.userAgent,
        acceptedAt: now,
      });
      return { user: user!, centre: centre! };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    throw constraintOf(err)?.includes("email") ? emailTaken() : accountExists();
  }
}

const accountExists = () =>
  new ApiError(409, "account_exists", "This number already has an account. Log in instead.");

const emailTaken = () =>
  new ApiError(409, "email_taken", "Another account uses this email.", {
    extra: { fields: { email: "Another account uses this email. Use a different one or leave it blank." } },
  });

/** The violated constraint's name, however the driver wraps the error. */
function constraintOf(err: unknown): string | undefined {
  const name = (e: unknown) => (e as { constraint?: string } | undefined)?.constraint;
  return name(err) ?? name((err as { cause?: unknown } | undefined)?.cause);
}
