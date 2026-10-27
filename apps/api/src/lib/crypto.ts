import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** A uniformly random 6-digit code, leading zeros kept. */
export function randomOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 256 bits, URL- and cookie-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Keyed hash for values we must recognise but never store: OTP codes and refresh
 * tokens. `purpose` separates the two so one can never be replayed as the other.
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

/**
 * A value the browser holds but can't alter or reuse after `expiresAt`: the
 * payload readable, with a keyed hash over it. For short-lived cookies only.
 */
export function seal(secret: string, purpose: string, payload: object, expiresAt: Date): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: expiresAt.getTime() })).toString("base64url");
  return `${body}.${keyedHash(secret, purpose, body)}`;
}

/** The payload of a sealed value, or null if it was altered, expired or is missing. */
export function unseal<T>(secret: string, purpose: string, value: string | undefined, now: Date): T | null {
  const [body, mac, extra] = value?.split(".") ?? [];
  if (!body || !mac || extra !== undefined || !/^[0-9a-f]{64}$/.test(mac)) return null;
  if (!sameHash(mac, keyedHash(secret, purpose, body))) return null;
  try {
    const { exp, ...payload } = JSON.parse(Buffer.from(body, "base64url").toString()) as { exp: number };
    return typeof exp === "number" && exp > now.getTime() ? (payload as T) : null;
  } catch {
    return null;
  }
}
