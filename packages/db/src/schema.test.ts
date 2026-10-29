import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { centres, refreshTokens, users } from "./schema";
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

  it("keep the owner's mobile number optional, as typed, on more than one owner", async () => {
    const { centre } = await insertOwner("98765 43210");
    await expect(db.insert(users).values({ centreId: centre.id, phone: "98765 43210" })).resolves.toBeDefined();
    const [noNumber] = await db.insert(centres).values({}).returning();
    const [owner] = await db.insert(users).values({ centreId: noNumber!.id }).returning();
    expect([noNumber!.ownerPhone, owner!.phone]).toEqual([null, null]);
  });

  it("keep no mobile-number codes: owners don't confirm their number", async () => {
    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_name in ('otp_challenges', 'signup_tickets')`,
    );
    const columns = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'users' and column_name = 'phone_verified_at'`,
    );
    expect([tables.rows, columns.rows]).toEqual([[], []]);
  });

  it("start a centre on Free with no subscription, and only allow known subscription states", async () => {
    const { centre } = await insertOwner();
    expect(centre).toMatchObject({ plan: "free", planRenewsAt: null, subscriptionId: null, subscriptionStatus: null });
    await expect(db.insert(centres).values({ subscriptionStatus: "paused" as never })).rejects.toThrow();
  });

  it("only allow known plans", async () => {
    await expect(db.insert(centres).values({ ownerPhone: "+919876543210", plan: "gold" as never })).rejects.toThrow();
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
    ["refresh_tokens.user_id", "users", "cascade"],
    ["batches.centre_id", "centres", "no action"],
    ["students.centre_id", "centres", "no action"],
    ["enrolments.centre_id", "centres", "no action"],
    ["enrolments.student_id", "students", "no action"],
    ["enrolments.batch_id", "batches", "no action"],
    ["enrolments.fee_plan_id", "fee_plans", "no action"],
    ["batches.fee_plan_id", "fee_plans", "no action"],
    ["fee_plans.centre_id", "centres", "no action"],
    ["invoices.centre_id", "centres", "no action"],
    ["invoices.student_id", "students", "no action"],
    ["invoices.enrolment_id", "enrolments", "no action"],
    ["invoices.batch_id", "batches", "no action"],
    ["invoices.waived_by", "users", "set null"],
    ["payment_settings.centre_id", "centres", "no action"],
    ["payments.centre_id", "centres", "no action"],
    ["payments.invoice_id", "invoices", "no action"],
    ["payments.recorded_by", "users", "set null"],
    ["receipts.centre_id", "centres", "no action"],
    ["receipts.payment_id", "payments", "no action"],
    ["payment_links.centre_id", "centres", "no action"],
    ["payment_links.invoice_id", "invoices", "no action"],
    ["webhook_events.centre_id", "centres", "no action"],
    ["reminders.centre_id", "centres", "no action"],
    ["reminders.invoice_id", "invoices", "cascade"],
    ["attendance.centre_id", "centres", "no action"],
    ["attendance.batch_id", "batches", "no action"],
    ["attendance.student_id", "students", "no action"],
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
    expect(links).toHaveLength(31);
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
