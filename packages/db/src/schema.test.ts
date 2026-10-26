import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { centres, otpChallenges, refreshTokens, users } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

async function insertOwner(phone = "+919876543210") {
  const [centre] = await db.insert(centres).values({ ownerPhone: phone }).returning();
  const [user] = await db.insert(users).values({ centreId: centre!.id, phone }).returning();
  return { centre: centre!, user: user! };
}

describe("migrations", () => {
  it("create a new centre on the free plan in India's timezone", async () => {
    const { centre } = await insertOwner();

    expect(centre.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(centre.plan).toBe("free");
    expect(centre.timezone).toBe("Asia/Kolkata");
    expect(centre.name).toBeNull();
    expect(centre.createdAt).toBeInstanceOf(Date);
  });

  it("make a first user an owner", async () => {
    const { user } = await insertOwner();
    expect(user.role).toBe("owner");
    expect(user.lastLoginAt).toBeNull();
  });

  it("allow each phone number one user only", async () => {
    const { centre } = await insertOwner("+919876543210");
    await expect(db.insert(users).values({ centreId: centre.id, phone: "+919876543210" })).rejects.toThrow();
  });

  it("only allow known plans", async () => {
    await expect(db.insert(centres).values({ ownerPhone: "+919876543210", plan: "gold" as never })).rejects.toThrow();
  });

  it("start an OTP challenge with no attempts", async () => {
    const [challenge] = await db
      .insert(otpChallenges)
      .values({ phone: "+919876543210", codeHash: "h", requestedIp: "203.0.113.7", expiresAt: new Date() })
      .returning();

    expect(challenge!.attempts).toBe(0);
    expect(challenge!.consumedAt).toBeNull();
  });

  it("move updated_at forward on every update", async () => {
    const { centre } = await insertOwner();
    await new Promise((resolve) => setTimeout(resolve, 5));

    const [renamed] = await db.update(centres).set({ name: "Sunrise Classes" }).where(eq(centres.id, centre.id)).returning();

    expect(renamed!.updatedAt.getTime()).toBeGreaterThan(centre.updatedAt.getTime());
  });

  it("link users to their centre and refresh tokens to their user", () => {
    const [userFk] = getTableConfig(users).foreignKeys;
    const [tokenFk] = getTableConfig(refreshTokens).foreignKeys;

    expect(userFk!.reference().foreignTable).toBe(centres);
    expect(tokenFk!.reference().foreignTable).toBe(users);
    expect(tokenFk!.onDelete).toBe("cascade");
  });

  it("keep refresh token hashes unique and delete them with their user", async () => {
    const { user } = await insertOwner();
    const token = { userId: user.id, familyId: randomUUID(), tokenHash: "same", expiresAt: new Date() };

    await db.insert(refreshTokens).values(token);
    await expect(db.insert(refreshTokens).values(token)).rejects.toThrow();

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(refreshTokens)).toHaveLength(0);
  });
});
