import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
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

  it("let a typed, unconfirmed number appear on more than one owner", async () => {
    const { centre } = await insertOwner("+919876543210");
    await expect(db.insert(users).values({ centreId: centre.id, phone: "+919876543210" })).resolves.toBeDefined();
  });

  it("give each confirmed phone number to one owner only", async () => {
    const confirmed = new Date();
    const { centre } = await insertOwner("+919876543210");
    await db.insert(users).values({ centreId: centre.id, phone: "+919876543211", phoneVerifiedAt: confirmed });
    await expect(
      db.insert(users).values({ centreId: centre.id, phone: "+919876543211", phoneVerifiedAt: confirmed }),
    ).rejects.toThrow();
  });

  it("start a new owner's number unconfirmed", async () => {
    const { user } = await insertOwner();
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it("only allow known plans", async () => {
    await expect(db.insert(centres).values({ ownerPhone: "+919876543210", plan: "gold" as never })).rejects.toThrow();
  });

  it("tie an OTP challenge to the owner confirming the number, and drop it with them", async () => {
    const { user } = await insertOwner();
    const [challenge] = await db
      .insert(otpChallenges)
      .values({ userId: user.id, phone: "+919876543211", codeHash: "h", requestedIp: "203.0.113.7", expiresAt: new Date() })
      .returning();
    expect(challenge!.userId).toBe(user.id);

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(otpChallenges)).toEqual([]);
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

  it.each([
    ["users.centre_id", "centres", "no action"],
    ["auth_identities.user_id", "users", "cascade"],
    ["consents.user_id", "users", "cascade"],
    ["otp_challenges.user_id", "users", "cascade"],
    ["refresh_tokens.user_id", "users", "cascade"],
    ["batches.centre_id", "centres", "no action"],
    ["students.centre_id", "centres", "no action"],
    ["enrolments.centre_id", "centres", "no action"],
    ["enrolments.student_id", "students", "no action"],
    ["enrolments.batch_id", "batches", "no action"],
  ])("link %s to %s (on delete: %s)", (column, target, onDelete) => {
    const tables = Object.values(schema).filter((value) => value instanceof PgTable);
    const links = tables.flatMap((table) => {
      const { name, foreignKeys } = getTableConfig(table);
      return foreignKeys.map((fk) => {
        const { columns, foreignTable } = fk.reference();
        return { from: `${name}.${columns[0]!.name}`, to: getTableConfig(foreignTable).name, onDelete: fk.onDelete };
      });
    });

    expect(links).toContainEqual({ from: column, to: target, onDelete });
    // Every link in the schema is listed here, so a new one needs a row above.
    expect(links).toHaveLength(10);
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
