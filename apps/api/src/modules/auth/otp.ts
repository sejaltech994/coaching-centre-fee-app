import { centres, otpChallenges, users, type Centre, type User } from "@chukta/db";
import type { IndianMobile } from "@chukta/shared";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Deps } from "../../deps";
import { keyedHash, randomOtp, sameHash } from "../../lib/crypto";
import { ApiError } from "../../lib/errors";

/** Login code rules from the TSD (Security, compliance and privacy). Hourly limits come from config. */
export const OTP_RULES = {
  ttlMs: 5 * 60_000,
  resendAfterMs: 30_000,
  maxAttempts: 5,
} as const;

const HOUR = 60 * 60_000;

const hashCode = (secret: string, phone: string, code: string) => keyedHash(secret, "otp", `${phone}:${code}`);
const secondsUntil = (from: Date, to: Date) => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));

const otpExpired = () => new ApiError(400, "otp_expired", "This code has expired. Request a new one.");

/** Sends a new login code, replacing any unused one for the same number. */
export async function requestOtp(deps: Deps, input: { phone: IndianMobile; ip: string }): Promise<void> {
  const { db, sms, config } = deps;
  const now = deps.now();
  const windowStart = new Date(now.getTime() - HOUR);

  // The 30-second wait applies only while the last code is still usable: after
  // logging out, an owner can log straight back in.
  const [latest] = await db
    .select({ createdAt: otpChallenges.createdAt, consumedAt: otpChallenges.consumedAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, input.phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  const resendAt = latest && !latest.consumedAt && new Date(latest.createdAt.getTime() + OTP_RULES.resendAfterMs);
  if (resendAt && resendAt > now) {
    const wait = secondsUntil(now, resendAt);
    throw new ApiError(429, "otp_resend_too_soon", `Wait ${wait} seconds before asking for a new code.`, {
      retryAfterSeconds: wait,
    });
  }

  const { perPhonePerHour, perIpPerHour } = config.otpLimits;
  await enforceHourlyLimit(deps, eq(otpChallenges.phone, input.phone), perPhonePerHour, windowStart, now);
  await enforceHourlyLimit(deps, eq(otpChallenges.requestedIp, input.ip), perIpPerHour, windowStart, now);

  const code = randomOtp();
  const challenge = await db.transaction(async (tx) => {
    await tx
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.phone, input.phone), isNull(otpChallenges.consumedAt)));
    const [row] = await tx
      .insert(otpChallenges)
      .values({
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
    // Not the user's fault: drop the challenge so they can retry straight away.
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

export type VerifiedPhone =
  | { status: "signed_in"; user: User; centre: Centre }
  | { status: "signup_required"; phone: IndianMobile };

/**
 * Checks a login code. A number with an account is signed in; an unknown number
 * is reported as verified but nothing is created until the owner registers.
 */
export async function verifyOtp(deps: Deps, input: { phone: IndianMobile; code: string }): Promise<VerifiedPhone> {
  const { db, config } = deps;
  const now = deps.now();

  const challenge = await db.query.otpChallenges.findFirst({
    where: and(eq(otpChallenges.phone, input.phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, now)),
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

  // Conditional on consumed_at still being null, so a code can't be used twice concurrently.
  const consumed = await db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (consumed.length === 0) throw otpExpired();

  const [user] = await db
    .update(users)
    .set({ lastLoginAt: now })
    .where(eq(users.phone, input.phone))
    .returning();
  if (!user) return { status: "signup_required", phone: input.phone };
  const centre = await db.query.centres.findFirst({ where: eq(centres.id, user.centreId) });
  return { status: "signed_in", user, centre: centre! };
}
