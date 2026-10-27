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

/** Same list as @chukta/shared's CENTRE_TYPES (the db package doesn't depend on shared). */
const CENTRE_TYPES = ["tuition", "coaching", "dance", "music", "sports", "other"] as const;

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
    // Set on profile setup. Null only for centres created before sign-up had a profile step.
    name: text("name"),
    city: text("city"),
    centreType: text("centre_type", { enum: CENTRE_TYPES }),
    ownerPhone: text("owner_phone").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    gstNumber: text("gst_number"),
    plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("centres_plan_check", sql`${t.plan} in ('free', 'pro')`),
    check(
      "centres_centre_type_check",
      sql.raw(`centre_type in (${CENTRE_TYPES.map((type) => `'${type}'`).join(", ")})`),
    ),
  ],
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
    // The owner's full name, from profile setup.
    name: text("name"),
    // Lower-cased. Optional for phone sign-ups; unique when present.
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: text("role", { enum: ["owner"] }).notNull().default("owner"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_role_check", sql`${t.role} in ('owner')`),
    index("users_centre_id_idx").on(t.centreId),
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
  ],
);

/** Which version of the terms and privacy notice an owner accepted, and when (DPDP evidence). */
export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["terms_and_privacy"] }).notNull(),
    version: text("version").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("consents_kind_check", sql`${t.kind} in ('terms_and_privacy')`), index("consents_user_id_idx").on(t.userId)],
);

/**
 * Proof that a phone number was verified, handed out when the number has no
 * account yet. POST /auth/register spends it to create the owner and centre.
 * Only a hash of the ticket is stored.
 */
export const signupTickets = pgTable("signup_tickets", {
  id: id(),
  phone: text("phone").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

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
export type Consent = typeof consents.$inferSelect;
export type SignupTicket = typeof signupTickets.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Batch = typeof batches.$inferSelect;
