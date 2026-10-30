import {
  attendance,
  authIdentities,
  batches,
  centres,
  enrolments,
  feePlans,
  invoices,
  paymentSettings,
  payments,
  receipts,
  refreshTokens,
  reminders,
  students,
  users,
  withCentre,
} from "@chukta/db";
import { and, eq, isNull, lte } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { localDate } from "../../lib/dates";
import { invalidFields, unauthenticated } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { COOKIE_PATH, DELETE_AFTER_MS, REFRESH_COOKIE } from "../auth/routes";

/**
 * Settings › Your data and Delete account (TSD: Profile and account; DPDP).
 * The export holds everything the centre has, but never a key, secret or token.
 */

/** Drops the fields no export should carry. */
const without = <T extends Record<string, unknown>>(row: T, ...fields: (keyof T)[]) =>
  Object.fromEntries(Object.entries(row).filter(([name]) => !fields.includes(name))) as Omit<T, (typeof fields)[number]>;

export async function exportData(deps: Deps, c: Context<AppEnv>) {
  const { centreId, userId } = c.var.auth;
  const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
  const [owner] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!centre || !owner) throw unauthenticated();

  const data = await withCentre(deps.db, centreId, async (tx) => {
    const [settings] = await tx.select().from(paymentSettings).where(eq(paymentSettings.centreId, centreId));
    return {
      paymentSettings: settings ? { upiId: settings.upiId, payeeName: settings.payeeName, razorpayKeyId: settings.razorpayKeyId } : null,
      batches: await tx.select().from(batches).where(eq(batches.centreId, centreId)),
      feePlans: await tx.select().from(feePlans).where(eq(feePlans.centreId, centreId)),
      students: await tx.select().from(students).where(eq(students.centreId, centreId)),
      enrolments: await tx.select().from(enrolments).where(eq(enrolments.centreId, centreId)),
      invoices: (await tx.select().from(invoices).where(eq(invoices.centreId, centreId))).map((i) => without(i, "publicToken")),
      payments: await tx.select().from(payments).where(eq(payments.centreId, centreId)),
      receipts: await tx.select().from(receipts).where(eq(receipts.centreId, centreId)),
      attendance: await tx.select().from(attendance).where(eq(attendance.centreId, centreId)),
      reminders: await tx.select().from(reminders).where(eq(reminders.centreId, centreId)),
    };
  });

  const now = deps.now();
  const body = JSON.stringify(
    {
      exportedAt: now.toISOString(),
      owner: { name: owner.name, email: owner.email, phone: owner.phone, createdAt: owner.createdAt },
      centre: without(centre, "subscriptionId"),
      ...data,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="chukta-export-${localDate(centre.timezone, now)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}

const deleteBody = z.object({ confirm: z.unknown() });

/** DELETE /me: asks for deletion in 30 days, and signs every device out now. */
export async function requestDeletion(deps: Deps, c: Context<AppEnv>) {
  const { confirm } = await readJson(c, deleteBody);
  const { centreId, userId } = c.var.auth;
  const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
  if (!centre) throw unauthenticated();
  if (typeof confirm !== "string" || confirm.trim() !== (centre.name ?? "").trim()) {
    throw invalidFields({ confirm: "Type your centre’s name exactly to confirm." });
  }
  const now = deps.now();
  await deps.db.update(centres).set({ deletionRequestedAt: now, updatedAt: now }).where(eq(centres.id, centreId));
  await deps.db.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  deleteCookie(c, REFRESH_COOKIE, { path: COOKIE_PATH, secure: deps.config.cookieSecure, httpOnly: true, sameSite: "Strict" });
  return c.json({ deletesAt: new Date(now.getTime() + DELETE_AFTER_MS).toISOString() });
}

/** POST /me/restore: the owner keeps the account. */
export async function keepAccount(deps: Deps, c: Context<AppEnv>) {
  await deps.db
    .update(centres)
    .set({ deletionRequestedAt: null, updatedAt: deps.now() })
    .where(and(eq(centres.id, c.var.auth.centreId), isNull(centres.deletedAt)));
  return c.json({ deletesAt: null });
}

/**
 * Hourly: carries out deletions 30 days on. The owner's personal data and
 * Google link go, students' names and parents' numbers are replaced, and the
 * fee records stay without names (TSD). The centre gets no more bills or messages.
 */
export async function eraseDeletedCentres(deps: Deps): Promise<void> {
  const now = deps.now();
  const due = await deps.db
    .select({ id: centres.id })
    .from(centres)
    .where(and(isNull(centres.deletedAt), lte(centres.deletionRequestedAt, new Date(now.getTime() - DELETE_AFTER_MS))));
  for (const { id } of due) {
    const owners = await deps.db.select({ id: users.id }).from(users).where(eq(users.centreId, id));
    for (const owner of owners) {
      await deps.db.delete(authIdentities).where(eq(authIdentities.userId, owner.id));
      await deps.db.delete(refreshTokens).where(eq(refreshTokens.userId, owner.id));
      await deps.db.update(users).set({ name: null, email: null, phone: null, updatedAt: now }).where(eq(users.id, owner.id));
    }
    await deps.db.delete(paymentSettings).where(eq(paymentSettings.centreId, id));
    await deps.db
      .update(students)
      .set({ name: "Former student", parentName: "Former parent", parentPhone: "deleted", whatsappOptIn: false, whatsappOptInAt: null, updatedAt: now })
      .where(eq(students.centreId, id));
    await deps.db
      .update(centres)
      .set({ name: null, city: null, ownerPhone: null, gstNumber: null, deletedAt: now, updatedAt: now })
      .where(eq(centres.id, id));
  }
}
