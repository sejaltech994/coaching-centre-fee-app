import { centres, otpChallenges, users, type Centre, type User } from "@chukta/db";
import type { IndianMobile } from "@chukta/shared";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Deps } from "../../deps";
import { keyedHash, randomOtp, sameHash } from "../../lib/crypto";
import { ApiError } from "../../lib/errors";

/** Login code rules from the TSD (Security, compliance and privacy). */
export const OTP_RULES = {
  ttlMs: 5 * 60_000,
  resendAfterMs: 30_000,
  maxAttempts: 5,
  perPhonePerHour: 5,
  perIpPerHour: 20,
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

  const [latest] = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, input.phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  const resendAt = latest && new Date(latest.createdAt.getTime() + OTP_RULES.resendAfterMs);
  if (resendAt && resendAt > now) {
    const wait = secondsUntil(now, resendAt);
    throw new ApiError(429, "otp_resend_too_soon", `Wait ${wait} seconds before asking for a new code.`, {
      retryAfterSeconds: wait,
    });
  }

  await enforceHourlyLimit(deps, eq(otpChallenges.phone, input.phone), OTP_RULES.perPhonePerHour, windowStart, now);
  await enforceHourlyLimit(deps, eq(otpChallenges.requestedIp, input.ip), OTP_RULES.perIpPerHour, windowStart, now);

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

/** Checks a login code. On success returns the owner, creating their centre on first login. */
export async function verifyOtp(
  deps: Deps,
  input: { phone: IndianMobile; code: string },
): Promise<{ user: User; centre: Centre; isNewAccount: boolean }> {
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
      `That code is not right. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
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

  return db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(users.phone, input.phone) });
    const isNewAccount = !user;
    if (!user) {
      const [centre] = await tx.insert(centres).values({ ownerPhone: input.phone }).returning();
      [user] = await tx.insert(users).values({ centreId: centre!.id, phone: input.phone }).returning();
    }
    const [loggedIn] = await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, user!.id)).returning();
    const centre = await tx.query.centres.findFirst({ where: eq(centres.id, loggedIn!.centreId) });
    return { user: loggedIn!, centre: centre!, isNewAccount };
  });
}
