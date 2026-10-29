import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authIdentities, centres, users } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

async function insertOwner(phone: string) {
  const [centre] = await db.insert(centres).values({ ownerPhone: phone }).returning();
  const [user] = await db.insert(users).values({ centreId: centre!.id, phone }).returning();
  return user!;
}

describe("auth_identities", () => {
  it("links a Google account to an owner, keeping its email and photo", async () => {
    const user = await insertOwner("+919876543210");

    const [identity] = await db
      .insert(authIdentities)
      .values({ userId: user.id, provider: "google", subject: "1234567890", email: "asha@example.com", pictureUrl: "https://lh3.example/a.png" })
      .returning();

    expect(identity).toMatchObject({ provider: "google", subject: "1234567890", email: "asha@example.com" });
    expect(identity!.createdAt).toBeInstanceOf(Date);
    expect(identity!.lastUsedAt).toBeNull();
  });

  it("links each Google account to one owner only", async () => {
    const asha = await insertOwner("+919876543210");
    const ravi = await insertOwner("+919876543211");
    await db.insert(authIdentities).values({ userId: asha.id, provider: "google", subject: "same", email: "a@example.com" });

    await expect(
      db.insert(authIdentities).values({ userId: ravi.id, provider: "google", subject: "same", email: "a@example.com" }),
    ).rejects.toThrow();
  });

  it("gives each owner at most one Google account", async () => {
    const asha = await insertOwner("+919876543210");
    await db.insert(authIdentities).values({ userId: asha.id, provider: "google", subject: "one", email: "a@example.com" });

    await expect(
      db.insert(authIdentities).values({ userId: asha.id, provider: "google", subject: "two", email: "b@example.com" }),
    ).rejects.toThrow();
  });

  it("only knows the providers the app supports", async () => {
    const asha = await insertOwner("+919876543210");
    await expect(
      db.insert(authIdentities).values({ userId: asha.id, provider: "facebook" as never, subject: "x", email: "a@example.com" }),
    ).rejects.toThrow();
  });

  it("goes away with its owner", async () => {
    const asha = await insertOwner("+919876543210");
    await db.insert(authIdentities).values({ userId: asha.id, provider: "google", subject: "one", email: "a@example.com" });

    await db.delete(users).where(eq(users.id, asha.id));

    expect(await db.select().from(authIdentities)).toEqual([]);
  });
});
