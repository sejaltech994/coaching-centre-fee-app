import { centres, otpChallenges, users, type Tx, type User } from "@chukta/db";
import type { IndianMobile } from "@chukta/shared";
import { and, asc, desc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Deps } from "../../deps";
import { keyedHash, randomOtp, sameHash } from "../../lib/crypto";
import { ApiError, isUniqueViolation } from "../../lib/errors";

/**
 * Confirming the owner's mobile number with a code by SMS (TSD: Profile and
 * account). Code rules from the TSD; hourly limits come from config.
 */
export const OTP_RULES = {
  ttlMs: 5 * 60_000,
  resendAfterMs: 30_000,
  maxAttempts: 5,
} as const;

const HOUR = 60 * 60_000;

const hashCode = (secret: string, phone: string, code: string) => keyedHash(secret, "otp", `${phone}:${code}`);
const secondsUntil = (from: Date, to: Date) => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));

const otpExpired = () => new ApiError(400, "otp_expired", "This code has expired. Request a new one.");
const phoneTaken = () => new ApiError(409, "phone_taken", "Another Chukta account has confirmed this number.");

/** Throws if another owner has already confirmed `phone`. */
async function ensureNotTaken(db: Deps["db"] | Tx, userId: string, phone: IndianMobile) {
  const other = await db.query.users.findFirst({
    where: and(eq(users.phone, phone), isNotNull(users.phoneVerifiedAt), ne(users.id, userId)),
  });
  if (other) throw phoneTaken();
}

/** Texts a new code to `phone` for this owner, replacing any unused one. */
export async function sendCode(deps: Deps, input: { userId: string; phone: IndianMobile; ip: string }): Promise<void> {
  const { db, sms, config } = deps;
  const now = deps.now();
  await ensureNotTaken(db, input.userId, input.phone);

  // The wait applies only while the owner's last code is still usable.
  const [latest] = await db
    .select({ createdAt: otpChallenges.createdAt, consumedAt: otpChallenges.consumedAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.userId, input.userId))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  const resendAt = latest && !latest.consumedAt && new Date(latest.createdAt.getTime() + OTP_RULES.resendAfterMs);
  if (resendAt && resendAt > now) {
    const wait = secondsUntil(now, resendAt);
    throw new ApiError(429, "otp_resend_too_soon", `Wait ${wait} seconds before asking for a new code.`, {
      retryAfterSeconds: wait,
    });
  }

  const windowStart = new Date(now.getTime() - HOUR);
  const { perPhonePerHour, perIpPerHour } = config.otpLimits;
  await enforceHourlyLimit(deps, eq(otpChallenges.phone, input.phone), perPhonePerHour, windowStart, now);
  await enforceHourlyLimit(deps, eq(otpChallenges.requestedIp, input.ip), perIpPerHour, windowStart, now);

  const code = randomOtp();
  const challenge = await db.transaction(async (tx) => {
    await tx
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.userId, input.userId), isNull(otpChallenges.consumedAt)));
    const [row] = await tx
      .insert(otpChallenges)
      .values({
        userId: input.userId,
        phone: input.phone,
        codeHash: hashCode(config.jwtSecret, input.phone, code),
        requestedIp: input.ip,
        expiresAt: new Date(now.getTime() + OTP_RULES.ttlMs),
        createdAt: now,
      })
      .returning({ id: otpChallenges.id });
    return row!;
  });

  try {
    await sms.sendOtp(input.phone, code);
  } catch (err) {
    // Not the owner's fault: drop the challenge so they can retry straight away.
    await db.delete(otpChallenges).where(eq(otpChallenges.id, challenge.id));
    console.error("SMS send failed", err);
    throw new ApiError(503, "sms_unavailable", "We couldn't send the SMS. Try again in a moment.");
  }
}

async function enforceHourlyLimit(
  { db }: Deps,
  scope: ReturnType<typeof eq>,
  limit: number,
  windowStart: Date,
  now: Date,
): Promise<void> {
  const recent = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(and(scope, gt(otpChallenges.createdAt, windowStart)))
    .orderBy(asc(otpChallenges.createdAt))
    .limit(limit);
  if (recent.length < limit) return;
  const freesUpAt = new Date(recent[0]!.createdAt.getTime() + HOUR);
  throw new ApiError(429, "rate_limited", "Too many codes requested. Try again later.", {
    retryAfterSeconds: secondsUntil(now, freesUpAt),
  });
}

/**
 * Checks the code this owner was sent for `phone`. When it matches, `phone`
 * becomes the owner's confirmed number (and their centre's).
 */
export async function confirmCode(
  deps: Deps,
  input: { userId: string; phone: IndianMobile; code: string },
): Promise<User> {
  const { db, config } = deps;
  const now = deps.now();

  const challenge = await db.query.otpChallenges.findFirst({
    where: and(
      eq(otpChallenges.userId, input.userId),
      eq(otpChallenges.phone, input.phone),
      isNull(otpChallenges.consumedAt),
      gt(otpChallenges.expiresAt, now),
    ),
    orderBy: desc(otpChallenges.createdAt),
  });
  if (!challenge) throw otpExpired();

  if (!sameHash(challenge.codeHash, hashCode(config.jwtSecret, input.phone, input.code))) {
    const [updated] = await db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(eq(otpChallenges.id, challenge.id))
      .returning({ attempts: otpChallenges.attempts });
    const attemptsLeft = OTP_RULES.maxAttempts - updated!.attempts;
    if (attemptsLeft <= 0) {
      await db.update(otpChallenges).set({ consumedAt: now }).where(eq(otpChallenges.id, challenge.id));
      throw new ApiError(429, "too_many_attempts", "Too many wrong codes. Request a new one.");
    }
    throw new ApiError(
      400,
      "invalid_otp",
      `That code didn’t match. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left.`,
      { extra: { attemptsLeft } },
    );
  }

  try {
    return await db.transaction(async (tx) => {
      // Conditional on consumed_at still being null, so a code can't be used twice concurrently.
      const consumed = await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
        .returning({ id: otpChallenges.id });
      if (consumed.length === 0) throw otpExpired();
      await ensureNotTaken(tx, input.userId, input.phone);

      const [user] = await tx
        .update(users)
        .set({ phone: input.phone, phoneVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, input.userId))
        .returning();
      await tx.update(centres).set({ ownerPhone: input.phone, updatedAt: now }).where(eq(centres.id, user!.centreId));
      return user!;
    });
  } catch (err) {
    // Another owner confirmed the same number at the same moment.
    if (isUniqueViolation(err)) throw phoneTaken();
    throw err;
  }
}
