import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** A coaching centre: the tenant. Every centre-owned table carries centre_id. */
export const centres = pgTable(
  "centres",
  {
    id: id(),
    // Set during onboarding; null until the owner names the centre.
    name: text("name"),
    ownerPhone: text("owner_phone").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    gstNumber: text("gst_number"),
    plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("centres_plan_check", sql`${t.plan} in ('free', 'pro')`)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    // E.164, e.g. +919876543210. One login per phone number.
    phone: text("phone").notNull().unique(),
    name: text("name"),
    role: text("role", { enum: ["owner"] }).notNull().default("owner"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('owner')`), index("users_centre_id_idx").on(t.centreId)],
);

/** One login code sent by SMS. Only a hash of the code is stored. */
export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: id(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    requestedIp: text("requested_ip").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    // Set when the code is used, replaced by a newer one, or locked after too many attempts.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("otp_challenges_attempts_check", sql`${t.attempts} >= 0`),
    // Rate limits count recent requests per phone and per IP.
    index("otp_challenges_phone_created_idx").on(t.phone, t.createdAt),
    index("otp_challenges_ip_created_idx").on(t.requestedIp, t.createdAt),
  ],
);

/**
 * Rotating refresh tokens. Each login starts a family; every refresh revokes the
 * presented token and issues its replacement in the same family. Presenting a
 * revoked token again means it leaked, so the whole family is revoked.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_family_id_idx").on(t.familyId), index("refresh_tokens_user_id_idx").on(t.userId)],
);

export type Centre = typeof centres.$inferSelect;
export type User = typeof users.$inferSelect;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
