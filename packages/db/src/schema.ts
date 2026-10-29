import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
    // The owner's own number as typed at sign-up; optional, never confirmed.
    ownerPhone: text("owner_phone"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    gstNumber: text("gst_number"),
    plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
    // How fee reminders read: gentle or firm (TSD: default_reminder_tone).
    reminderTone: text("reminder_tone", { enum: ["gentle", "firm"] }).notNull().default("gentle"),
    // Message parents on WhatsApp when their child is marked absent (TSD: absence-alert).
    absenceAlerts: boolean("absence_alerts").notNull().default(false),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    // The Pro subscription on Chukta's own Razorpay account, and where it stands.
    subscriptionId: text("subscription_id").unique(),
    subscriptionStatus: text("subscription_status", { enum: ["created", "active", "cancelled", "halted"] }),
    // The owner asked to delete the account; it's carried out 30 days later (TSD: Delete account).
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    // Carried out: personal data erased, fee records kept without names.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("centres_plan_check", sql`${t.plan} in ('free', 'pro')`),
    check("centres_subscription_status_check", sql`${t.subscriptionStatus} in ('created', 'active', 'cancelled', 'halted')`),
    check("centres_reminder_tone_check", sql`${t.reminderTone} in ('gentle', 'firm')`),
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
    // The owner's own number, as they typed it; optional and never confirmed.
    phone: text("phone"),
    // The owner's full name, from profile setup.
    name: text("name"),
    // Lower-cased; Google's address. Empty only on accounts from before Google sign-in.
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

/**
 * How an owner signs in: Google, the only way. Subject = Google's stable
 * account id ("sub"). Google's own tokens are never stored.
 */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google"] }).notNull(),
    subject: text("subject").notNull(),
    // As Google reported it when last used; the account's own email is users.email.
    email: text("email").notNull(),
    pictureUrl: text("picture_url"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("auth_identities_provider_check", sql`${t.provider} in ('google')`),
    uniqueIndex("auth_identities_provider_subject_unique").on(t.provider, t.subject),
    // One Google account per owner.
    uniqueIndex("auth_identities_user_provider_unique").on(t.userId, t.provider),
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
    // Where the device was when this token was issued (Cloudflare's guess from its IP), if known.
    city: text("city"),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_family_id_idx").on(t.familyId), index("refresh_tokens_user_id_idx").on(t.userId)],
);

/** Every centre-owned table: rows are visible and writable only inside withCentre for their centre. */
const centreIsolation = (name: string, centreId: AnyPgColumn) =>
  pgPolicy(name, {
    as: "permissive",
    for: "all",
    to: appRole,
    using: sql`${centreId} = ${currentCentre}`,
    withCheck: sql`${centreId} = ${currentCentre}`,
  });

/**
 * A fee and when it falls due (TSD: fee plans): monthly or quarterly on a day of
 * the month, or once. Money is in paise. Archived (is_active = false) rather
 * than deleted, as batches and enrolments keep pointing at it.
 */
export const feePlans = pgTable(
  "fee_plans",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    name: text("name").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    cycle: text("cycle", { enum: ["monthly", "quarterly", "one_time"] }).notNull(),
    // 1–28, so it exists in every month; none for a one-time fee.
    dueDay: integer("due_day"),
    lateFeePaise: integer("late_fee_paise"),
    lateFeeAfterDays: integer("late_fee_after_days"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("fee_plans_centre_id_idx").on(t.centreId),
    check("fee_plans_name_check", sql`length(trim(${t.name})) > 0`),
    check("fee_plans_amount_check", sql`${t.amountPaise} > 0`),
    check("fee_plans_cycle_check", sql`${t.cycle} in ('monthly', 'quarterly', 'one_time')`),
    check(
      "fee_plans_due_day_check",
      // "is not null" matters: a check that comes out NULL counts as passed.
      sql`(${t.cycle} = 'one_time' and ${t.dueDay} is null) or (${t.cycle} <> 'one_time' and ${t.dueDay} is not null and ${t.dueDay} between 1 and 28)`,
    ),
    check(
      "fee_plans_late_fee_check",
      sql`(${t.lateFeePaise} is null and ${t.lateFeeAfterDays} is null) or (${t.lateFeePaise} is not null and ${t.lateFeeAfterDays} is not null and ${t.lateFeePaise} between 1 and ${t.amountPaise} and ${t.lateFeeAfterDays} between 1 and 60)`,
    ),
    centreIsolation("fee_plans_centre_isolation", t.centreId),
  ],
).enableRLS();

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
    // Students who join the batch are billed on this plan.
    feePlanId: uuid("fee_plan_id").references(() => feePlans.id),
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
    centreIsolation("batches_centre_isolation", t.centreId),
  ],
).enableRLS();

/** A child at the centre, with the parent who pays and gets the reminders. */
export const students = pgTable(
  "students",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    name: text("name").notNull(),
    parentName: text("parent_name").notNull(),
    // E.164. Reminders and receipts go here.
    parentPhone: text("parent_phone").notNull(),
    // TSD (Consent): the parent agreed to WhatsApp messages; recorded with when.
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    whatsappOptInAt: timestamp("whatsapp_opt_in_at", { withTimezone: true }),
    status: text("status", { enum: ["active", "left"] }).notNull().default("active"),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("students_centre_status_name_idx").on(t.centreId, t.status, sql`lower(${t.name})`),
    index("students_centre_parent_phone_idx").on(t.centreId, t.parentPhone),
    check("students_name_check", sql`length(trim(${t.name})) > 0`),
    check("students_parent_name_check", sql`length(trim(${t.parentName})) > 0`),
    check("students_status_check", sql`${t.status} in ('active', 'left')`),
    centreIsolation("students_centre_isolation", t.centreId),
  ],
).enableRLS();

/**
 * A student in a batch from start_date until end_date (open while null), billed
 * on fee_plan_id (the batch's plan when they joined) less discount_paise.
 */
export const enrolments = pgTable(
  "enrolments",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    feePlanId: uuid("fee_plan_id").references(() => feePlans.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    discountPaise: integer("discount_paise").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("enrolments_centre_batch_idx").on(t.centreId, t.batchId),
    index("enrolments_student_idx").on(t.studentId),
    // One current enrolment per student and batch; ended ones are history.
    uniqueIndex("enrolments_current_unique").on(t.studentId, t.batchId).where(sql`${t.endDate} is null`),
    check("enrolments_dates_check", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check("enrolments_discount_check", sql`${t.discountPaise} >= 0`),
    centreIsolation("enrolments_centre_isolation", t.centreId),
  ],
).enableRLS();

/**
 * A bill for one enrolment and one billing period (TSD: generate-invoices).
 * The amount (fee less discount) and the plan's late-fee terms are copied on at
 * creation, so later changes to the plan don't rewrite bills already sent.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    enrolmentId: uuid("enrolment_id")
      .notNull()
      .references(() => enrolments.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    // 1, 2, 3… within the centre: what parents and the owner quote.
    number: integer("number").notNull(),
    // The secret in the parent's pay link (/pay?t=…): 128 random bits, no centre id.
    publicToken: text("public_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    cycle: text("cycle", { enum: ["monthly", "quarterly", "one_time"] }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    planLateFeePaise: integer("plan_late_fee_paise"),
    planLateFeeAfterDays: integer("plan_late_fee_after_days"),
    // The late fee added once it fell due.
    lateFeePaise: integer("late_fee_paise").notNull().default(0),
    status: text("status", { enum: ["pending", "overdue", "paid", "waived"] }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedBy: uuid("waived_by").references(() => users.id, { onDelete: "set null" }),
    waiveReason: text("waive_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // For the dashboard and the reminder and overdue scans (TSD: key indexes).
    index("invoices_centre_status_due_idx").on(t.centreId, t.status, t.dueDate),
    index("invoices_student_idx").on(t.studentId),
    uniqueIndex("invoices_enrolment_period_unique").on(t.enrolmentId, t.periodStart),
    uniqueIndex("invoices_centre_number_unique").on(t.centreId, t.number),
    check("invoices_amount_check", sql`${t.amountPaise} > 0`),
    check("invoices_money_check", sql`${t.discountPaise} >= 0 and ${t.lateFeePaise} >= 0`),
    check("invoices_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("invoices_status_check", sql`${t.status} in ('pending', 'overdue', 'paid', 'waived')`),
    check("invoices_paid_check", sql`${t.status} <> 'paid' or ${t.paidAt} is not null`),
    check(
      "invoices_waived_check",
      sql`${t.status} <> 'waived' or (${t.waivedAt} is not null and ${t.waiveReason} is not null and length(trim(${t.waiveReason})) > 0)`,
    ),
    centreIsolation("invoices_centre_isolation", t.centreId),
  ],
).enableRLS();

/** How parents pay a centre: its own UPI ID (TSD: Integrations › Payments). Chukta never holds the money. */
export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .unique()
      .references(() => centres.id),
    upiId: text("upi_id"),
    payeeName: text("payee_name"),
    // The centre's own Razorpay account (optional). The secrets are stored only
    // encrypted (AES-GCM, see apps/api lib/secrets); the key id is not secret.
    razorpayKeyId: text("razorpay_key_id"),
    razorpayKeySecret: text("razorpay_key_secret"),
    razorpayWebhookSecret: text("razorpay_webhook_secret"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [centreIsolation("payment_settings_centre_isolation", t.centreId)],
).enableRLS();

export const PAYMENT_METHODS = ["upi", "cash", "bank_transfer", "card", "netbanking", "wallet"] as const;

/** Money received for a bill: recorded by the owner, or by the centre's gateway. One per bill (bills are paid in full). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .unique()
      .references(() => invoices.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    // UPI reference (UTR), bank reference or a note.
    reference: text("reference"),
    // Set for gateway payments; unique, so a repeated webhook records nothing new.
    gatewayPaymentId: text("gateway_payment_id").unique(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_centre_received_idx").on(t.centreId, t.receivedAt),
    check("payments_amount_check", sql`${t.amountPaise} > 0`),
    check("payments_method_check", sql.raw(`method in (${PAYMENT_METHODS.map((m) => `'${m}'`).join(", ")})`)),
    centreIsolation("payments_centre_isolation", t.centreId),
  ],
).enableRLS();

/** One receipt per payment, numbered 1, 2, 3… per centre. Its PDF is drawn from these rows on request. */
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    paymentId: uuid("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    number: integer("number").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("receipts_centre_number_unique").on(t.centreId, t.number),
    centreIsolation("receipts_centre_isolation", t.centreId),
  ],
).enableRLS();

/** A Razorpay Payment Link made for a bill on the centre's own account; reused until it expires. */
export const paymentLinks = pgTable(
  "payment_links",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    gateway: text("gateway", { enum: ["razorpay"] }).notNull().default("razorpay"),
    gatewayLinkId: text("gateway_link_id").notNull().unique(),
    shortUrl: text("short_url").notNull(),
    // The amount it asks for: a late fee added later needs a new link.
    amountPaise: integer("amount_paise").notNull(),
    status: text("status").notNull().default("created"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payment_links_invoice_idx").on(t.invoiceId),
    index("payment_links_centre_status_idx").on(t.centreId, t.status),
    centreIsolation("payment_links_centre_isolation", t.centreId),
  ],
).enableRLS();

/** Every webhook received, once per (source, event id): an audit log that makes repeats harmless (TSD). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    centreId: uuid("centre_id").references(() => centres.id),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("webhook_events_source_event_unique").on(t.source, t.eventId)],
);

export const REMINDER_KINDS = ["pre_due", "due", "overdue_3", "overdue_7", "manual", "payment_received"] as const;
export const REMINDER_STATUSES = ["sent", "delivered", "read", "failed", "skipped"] as const;

/**
 * A WhatsApp message about a bill: a scheduled or hand-sent reminder, or the
 * thank-you with its receipt. Keeps the template and version used, so every
 * message traces to its exact wording; Meta's delivery reports update status.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: REMINDER_KINDS }).notNull(),
    channel: text("channel", { enum: ["whatsapp"] }).notNull().default("whatsapp"),
    template: text("template").notNull(),
    templateVersion: integer("template_version").notNull(),
    status: text("status", { enum: REMINDER_STATUSES }).notNull(),
    providerMessageId: text("provider_message_id").unique(),
    // Why it failed or was skipped (e.g. the parent opted out).
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reminders_centre_created_idx").on(t.centreId, t.createdAt),
    // Each scheduled reminder goes once per bill; reminders sent by hand can repeat.
    uniqueIndex("reminders_invoice_kind_unique")
      .on(t.invoiceId, t.kind)
      .where(sql`${t.kind} <> 'manual'`),
    check("reminders_kind_check", sql.raw(`kind in (${REMINDER_KINDS.map((k) => `'${k}'`).join(", ")})`)),
    check("reminders_status_check", sql.raw(`status in (${REMINDER_STATUSES.map((k) => `'${k}'`).join(", ")})`)),
    centreIsolation("reminders_centre_isolation", t.centreId),
  ],
).enableRLS();

/** A day's attendance for one student in one batch (TSD: attendance), and any absence alert sent for it. */
export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    centreId: uuid("centre_id")
      .notNull()
      .references(() => centres.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    date: date("date").notNull(),
    present: boolean("present").notNull(),
    // The parent was told of the absence (or why not), at most once per mark.
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    alertError: text("alert_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("attendance_batch_student_date_unique").on(t.batchId, t.studentId, t.date),
    index("attendance_centre_batch_date_idx").on(t.centreId, t.batchId, t.date),
    centreIsolation("attendance_centre_isolation", t.centreId),
  ],
).enableRLS();

export type Centre = typeof centres.$inferSelect;
export type User = typeof users.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type AuthIdentity = typeof authIdentities.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Enrolment = typeof enrolments.$inferSelect;
export type FeePlan = typeof feePlans.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type PaymentLink = typeof paymentLinks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type PaymentSettings = typeof paymentSettings.$inferSelect;
