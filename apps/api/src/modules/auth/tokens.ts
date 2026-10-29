import { randomUUID } from "node:crypto";
import { refreshTokens, users } from "@chukta/db";
import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import type { AuthContext, Deps } from "../../deps";
import { keyedHash, randomToken } from "../../lib/crypto";
import { ApiError, unauthenticated } from "../../lib/errors";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const ISSUER = "chukta-api";
const AUDIENCE = "chukta-web";

const signingKey = (secret: string) => new TextEncoder().encode(secret);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

export async function signAccessToken({ config, now }: Deps, auth: AuthContext): Promise<string> {
  const issuedAt = seconds(now());
  return new SignJWT({ cid: auth.centreId, role: auth.role, ...(auth.sessionId && { sid: auth.sessionId }) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(auth.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(signingKey(config.jwtSecret));
}

/** The caller behind an access token, or null if it is missing, forged or expired. */
export async function verifyAccessToken({ config, now }: Deps, token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(config.jwtSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now(),
    });
    if (typeof payload.sub !== "string" || typeof payload.cid !== "string" || payload.role !== "owner") return null;
    const sessionId = typeof payload.sid === "string" ? payload.sid : undefined;
    return { userId: payload.sub, centreId: payload.cid, role: payload.role, sessionId };
  } catch {
    return null;
  }
}

const hashToken = (secret: string, token: string) => keyedHash(secret, "refresh", token);

/** Stores a new refresh token (hashed) and returns the raw value for the cookie. */
export async function issueRefreshToken(
  { db, config, now }: Deps,
  input: { userId: string; familyId?: string; userAgent?: string; city?: string | null },
): Promise<{ id: string; token: string; sessionId: string }> {
  const token = randomToken();
  const createdAt = now();
  const familyId = input.familyId ?? randomUUID();
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId: input.userId,
      familyId,
      tokenHash: hashToken(config.jwtSecret, token),
      expiresAt: new Date(createdAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      userAgent: input.userAgent ?? null,
      city: input.city ?? null,
      createdAt,
    })
    .returning({ id: refreshTokens.id });
  return { id: row!.id, token, sessionId: familyId };
}

/**
 * Exchanges a refresh token for a new one in the same family. A token that was
 * already exchanged has leaked: its whole family (that login's session) is revoked.
 */
export async function rotateRefreshToken(
  deps: Deps,
  token: string,
  userAgent?: string,
  city?: string | null,
): Promise<{ auth: AuthContext; token: string }> {
  const { db, config, now } = deps;
  const current = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, hashToken(config.jwtSecret, token)),
  });
  if (!current) throw unauthenticated();

  const revokeFamily = () =>
    db
      .update(refreshTokens)
      .set({ revokedAt: now() })
      .where(and(eq(refreshTokens.familyId, current.familyId), isNull(refreshTokens.revokedAt)));

  if (current.revokedAt) {
    await revokeFamily();
    throw new ApiError(401, "refresh_token_reused", "This session was signed out for safety. Log in again.");
  }
  if (current.expiresAt <= now()) throw unauthenticated();

  const user = await db.query.users.findFirst({ where: eq(users.id, current.userId) });
  if (!user) throw unauthenticated();

  const next = await issueRefreshToken(deps, { userId: user.id, familyId: current.familyId, userAgent, city });
  // Conditional on revoked_at still being null, so two concurrent refreshes can't both win.
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: now(), replacedById: next.id })
    .where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  if (revoked.length === 0) {
    await revokeFamily();
    throw new ApiError(401, "refresh_token_reused", "This session was signed out for safety. Log in again.");
  }

  return {
    auth: { userId: user.id, centreId: user.centreId, role: user.role, sessionId: current.familyId },
    token: next.token,
  };
}

export async function revokeRefreshToken({ db, config, now }: Deps, token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(config.jwtSecret, token)), isNull(refreshTokens.revokedAt)));
}
