import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

/** 256 bits, URL- and cookie-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Keyed hash for values we must recognise but never store, such as refresh
 * tokens. `purpose` keeps each kind apart so one can never be replayed as another.
 */
export function keyedHash(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE S256 challenge: base64url(SHA-256(verifier)), RFC 7636. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const sealKey = (secret: string) => new TextEncoder().encode(secret);
const sealAudience = (purpose: string) => `chukta:${purpose}`;

/**
 * A value the browser holds but can't alter or reuse after `expiresAt`: a signed
 * JWT (HS256) whose audience is `purpose`, so one kind can't stand in for another.
 * The payload is readable. For short-lived cookies only.
 */
export function seal(secret: string, purpose: string, payload: JWTPayload, expiresAt: Date): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(sealAudience(purpose))
    .setExpirationTime(expiresAt)
    .sign(sealKey(secret));
}

/** The payload of a sealed value, or null if it was altered, expired, for another purpose or is missing. */
export async function unseal<T>(secret: string, purpose: string, value: string | undefined, now: Date): Promise<T | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, sealKey(secret), {
      algorithms: ["HS256"],
      audience: sealAudience(purpose),
      currentDate: now,
    });
    const { aud: _aud, exp: _exp, ...rest } = payload;
    return rest as T;
  } catch {
    return null;
  }
}
