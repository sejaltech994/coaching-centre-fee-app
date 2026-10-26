import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

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
