import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Created in migration 0001; centre-scoped transactions run as this role (see withCentre). */
export const appRole = pgRole("chukta_app").existing();

/** RLS predicate: the row belongs to the centre set for this transaction. */
const currentCentre = sql`nullif(current_setting('app.centre_id', true), '')::uuid`;

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

/** A class group with a weekly schedule. Archived (is_active = false) rather than deleted. */
export const batches = pgTable(
  "batches",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    name: text("name").notNull(),
    subject: text("subject"),
    // Lower-case weekday codes, Monday first: {mon,wed,fri}.
    days: text("days").array().notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("batches_centre_id_idx").on(t.centreId),
    // Archived batches free their name for reuse.
    uniqueIndex("batches_centre_active_name_unique")
      .on(t.centreId, sql`lower(${t.name})`)
      .where(sql`${t.isActive}`),
    check("batches_name_check", sql`length(trim(${t.name})) > 0`),
    check(
      "batches_days_check",
      sql`cardinality(${t.days}) > 0 and ${t.days} <@ array['mon','tue','wed','thu','fri','sat','sun']`,
    ),
    check("batches_time_check", sql`${t.endTime} > ${t.startTime}`),
    pgPolicy("batches_centre_isolation", {
      as: "permissive",
      for: "all",
      to: appRole,
      using: sql`${t.centreId} = ${currentCentre}`,
      withCheck: sql`${t.centreId} = ${currentCentre}`,
    }),
  ],
).enableRLS();

export type Centre = typeof centres.$inferSelect;
export type User = typeof users.$inferSelect;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Batch = typeof batches.$inferSelect;
