import { refreshTokens } from "@chukta/db";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Deps } from "../../deps";
import { describeDevice } from "../../lib/device";

/**
 * Where the owner is signed in (TSD: Profile and account › Devices). Each sign-in
 * is a refresh-token family; it is active while it holds a token that is neither
 * revoked nor expired.
 */

export type DeviceSession = { id: string; device: string; city: string | null; signedInAt: string; lastActiveAt: string; current: boolean };

const active = (now: Date) => and(isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, now));

export async function listSessions(deps: Deps, userId: string, currentId?: string): Promise<DeviceSession[]> {
  const now = deps.now();
  const families = await deps.db
    .select({
      id: refreshTokens.familyId,
      signedInAt: sql<Date>`min(${refreshTokens.createdAt})`.mapWith(refreshTokens.createdAt),
      lastActiveAt: sql<Date>`max(${refreshTokens.createdAt})`.mapWith(refreshTokens.createdAt),
      // The browser of the family's newest token, i.e. as it was last seen.
      userAgent: sql<string | null>`(array_agg(${refreshTokens.userAgent} order by ${refreshTokens.createdAt} desc))[1]`,
      // The newest city known for the family.
      city: sql<string | null>`(array_agg(${refreshTokens.city} order by ${refreshTokens.createdAt} desc) filter (where ${refreshTokens.city} is not null))[1]`,
      live: sql<boolean>`bool_or(${refreshTokens.revokedAt} is null and ${refreshTokens.expiresAt} > ${now})`,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId))
    .groupBy(refreshTokens.familyId);

  return families
    .filter((family) => family.live)
    .map((family) => ({
      id: family.id,
      device: describeDevice(family.userAgent),
      city: family.city,
      signedInAt: family.signedInAt.toISOString(),
      lastActiveAt: family.lastActiveAt.toISOString(),
      current: family.id === currentId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** Signs one of the owner's devices out; false if they have no such active session. */
export async function revokeSession(deps: Deps, userId: string, sessionId: string): Promise<boolean> {
  const now = deps.now();
  const revoked = await deps.db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.familyId, sessionId), active(now)))
    .returning({ id: refreshTokens.id });
  return revoked.length > 0;
}

/** Signs out every device but the one calling; returns how many were signed out. */
export async function revokeOtherSessions(deps: Deps, userId: string, currentId?: string): Promise<number> {
  const now = deps.now();
  const revoked = await deps.db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.userId, userId), active(now), ...(currentId ? [ne(refreshTokens.familyId, currentId)] : [])))
    .returning({ familyId: refreshTokens.familyId });
  return new Set(revoked.map((row) => row.familyId)).size;
}
