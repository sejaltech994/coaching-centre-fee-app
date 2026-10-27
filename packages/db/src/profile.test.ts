import { beforeEach, describe, expect, it } from "vitest";
import { centres, consents, signupTickets, users } from "./schema";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

async function insertOwner(phone: string, email: string | null = null) {
  const [centre] = await db
    .insert(centres)
    .values({ ownerPhone: phone, name: "Sunrise Classes", city: "Pune", centreType: "coaching" })
    .returning();
  const [user] = await db.insert(users).values({ centreId: centre!.id, phone, name: "Asha Sharma", email }).returning();
  return { centre: centre!, user: user! };
}

describe("profile migration", () => {
  it("stores a centre's city and type", async () => {
    const { centre } = await insertOwner("+919876543210");
    expect(centre).toMatchObject({ city: "Pune", centreType: "coaching" });
  });

  it("only allows the TSD's centre types", async () => {
    await expect(
      db.insert(centres).values({ ownerPhone: "+919876543210", centreType: "bakery" as never }),
    ).rejects.toThrow();
  });

  it("allows an owner without an email, and many of them", async () => {
    await insertOwner("+919876543210");
    const { user } = await insertOwner("+919876543211");
    expect(user.email).toBeNull();
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("allows each email one owner only, ignoring case", async () => {
    await insertOwner("+919876543210", "asha@example.com");
    await expect(insertOwner("+919876543211", "ASHA@example.com")).rejects.toThrow();
  });

  it("records which terms an owner accepted, and when", async () => {
    const { user } = await insertOwner("+919876543210");
    const [consent] = await db
      .insert(consents)
      .values({ userId: user.id, kind: "terms_and_privacy", version: "2026-10", ip: "203.0.113.7" })
      .returning();

    expect(consent).toMatchObject({ userId: user.id, kind: "terms_and_privacy", version: "2026-10" });
    expect(consent!.acceptedAt).toBeInstanceOf(Date);
  });

  it("keeps signup ticket hashes unique and starts them unused", async () => {
    const ticket = { phone: "+919876543210", tokenHash: "same", expiresAt: new Date() };
    const [row] = await db.insert(signupTickets).values(ticket).returning();

    expect(row!.consumedAt).toBeNull();
    await expect(db.insert(signupTickets).values(ticket)).rejects.toThrow();
  });
});
