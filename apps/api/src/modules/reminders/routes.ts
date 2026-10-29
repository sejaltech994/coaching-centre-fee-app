import { centres, invoices, reminders, students, webhookEvents, withCentre } from "@chukta/db";
import { verifyMetaSignature } from "@chukta/integrations";
import { messageFor } from "@chukta/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { centreToday } from "../../lib/dates";
import { ApiError, invalidFields, invalidRequest } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { blocker, deliver, loadCentre, loadTargets, previewText, type Outcome } from "./send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
const cursorShape = z.object({ t: z.string(), i: z.string().regex(UUID) });
function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    throw invalidRequest("The cursor is not valid.");
  }
}

const sendBody = z.object({ invoiceIds: z.array(z.string().regex(UUID)).min(1).max(100) });

/** TSD: GET /reminders (what was sent), POST /reminders/send ("remind all"), and a preview first. */
export function reminderRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) throw invalidRequest("The query is not valid.");
    const { limit, cursor } = parsed.data;
    const after = cursor ? decodeCursor(cursor) : undefined;
    const { centreId } = c.var.auth;
    const rows = await withCentre(deps.db, centreId, (tx) =>
      tx
        .select({ reminder: reminders, number: invoices.number, student: { id: students.id, name: students.name } })
        .from(reminders)
        .innerJoin(invoices, eq(invoices.id, reminders.invoiceId))
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(
          and(
            eq(reminders.centreId, centreId),
            after ? sql`(${reminders.createdAt}, ${reminders.id}) < (${after.t}::timestamptz, ${after.i}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(reminders.createdAt), desc(reminders.id))
        .limit(limit + 1),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1)?.reminder;
    return c.json({
      reminders: page.map(({ reminder, number, student }) => ({
        id: reminder.id,
        kind: reminder.kind,
        status: reminder.status,
        template: reminder.template,
        error: reminder.error,
        invoice: { id: reminder.invoiceId, number },
        student,
        sentAt: reminder.sentAt?.toISOString() ?? null,
        createdAt: reminder.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify({ t: last.createdAt.toISOString(), i: last.id })).toString("base64url")
          : null,
    });
  });

  routes.get("/preview", async (c) => {
    const invoiceId = c.req.query("invoiceId") ?? "";
    if (!UUID.test(invoiceId)) throw invalidRequest("Say which bill to preview.");
    const { centreId } = c.var.auth;
    const centre = await loadCentre(deps, centreId);
    const today = await centreToday(deps, centreId);
    const [target] = await loadTargets(deps, centreId, eq(invoices.id, invoiceId));
    if (!centre || !target) throw new ApiError(404, "not_found", "No such bill.");
    const reason = blocker(deps, target);
    return c.json({ text: previewText(deps, centre, target, today), canSend: reason === null, reason });
  });

  routes.post("/send", async (c) => {
    const parsed = sendBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw invalidFields({ invoiceIds: "Pick the bills to remind about." });
    const ids = [...new Set(parsed.data.invoiceIds)];
    const { centreId } = c.var.auth;
    const centre = (await loadCentre(deps, centreId))!;
    const today = await centreToday(deps, centreId);
    const targets = new Map((await loadTargets(deps, centreId, inArray(invoices.id, ids))).map((t) => [t.invoice.id, t]));

    const results: (Outcome & { invoiceId: string })[] = [];
    for (const invoiceId of ids) {
      const target = targets.get(invoiceId);
      if (!target) results.push({ invoiceId, status: "skipped", error: "No such bill." });
      else if (target.invoice.status !== "pending" && target.invoice.status !== "overdue") {
        results.push({ invoiceId, status: "skipped", error: "This bill is already paid or waived." });
      } else {
        results.push({ invoiceId, ...(await deliver(deps, { centre, target, kind: "manual", key: messageFor(target.invoice.dueDate, today) })) });
      }
    }
    return c.json({ results });
  });

  return routes;
}

const toneBody = z.object({ tone: z.enum(["gentle", "firm"]) });

/** GET and PUT /centre/reminder-tone: gentle or firm (TSD: default_reminder_tone). */
export function reminderToneRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));
  routes.get("/", async (c) => {
    const centre = await loadCentre(deps, c.var.auth.centreId);
    return c.json({ tone: centre?.reminderTone ?? "gentle" });
  });
  routes.put("/", async (c) => {
    const { tone } = await readJson(c, toneBody);
    await deps.db.update(centres).set({ reminderTone: tone, updatedAt: deps.now() }).where(eq(centres.id, c.var.auth.centreId));
    return c.json({ tone });
  });
  return routes;
}

type MetaChange = {
  statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
  messages?: { id: string; from: string; type: string; text?: { body?: string } }[];
};

/** Which delivery statuses each one may replace: never backwards, so "read" stays read. */
const EARLIER: Record<string, ("sent" | "delivered")[]> = { delivered: ["sent"], read: ["sent", "delivered"], failed: ["sent", "delivered"] };

/**
 * Meta's WhatsApp webhook (TSD: POST /webhooks/whatsapp): delivery and read
 * statuses update reminders, and a parent replying STOP is opted out.
 */
export function whatsappWebhookRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  const meta = deps.config.whatsapp?.provider === "meta" ? deps.config.whatsapp : null;
  if (!meta) return routes;

  // Meta's one-time check when the webhook is added in the app dashboard.
  routes.get("/", (c) => {
    const ok = c.req.query("hub.mode") === "subscribe" && c.req.query("hub.verify_token") === meta.verifyToken;
    return ok ? c.text(c.req.query("hub.challenge") ?? "") : c.text("Forbidden", 403);
  });

  routes.post("/", async (c) => {
    const raw = await c.req.text();
    if (!(await verifyMetaSignature(raw, c.req.header("x-hub-signature-256") ?? "", meta.appSecret))) {
      throw new ApiError(401, "bad_signature", "The webhook signature doesn't match.");
    }
    const payload = JSON.parse(raw) as { entry?: { changes?: { value?: MetaChange }[] }[] };
    const now = deps.now();
    for (const value of (payload.entry ?? []).flatMap((e) => e.changes ?? []).map((ch) => ch.value ?? {})) {
      for (const status of value.statuses ?? []) {
        const stored = await deps.db
          .insert(webhookEvents)
          .values({ source: "whatsapp", eventId: `${status.id}:${status.status}`, payload: status, processedAt: now, createdAt: now })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id });
        const earlier = EARLIER[status.status];
        if (stored.length === 0 || !earlier) continue;
        await deps.db
          .update(reminders)
          .set({
            status: status.status as "delivered" | "read" | "failed",
            ...(status.status === "failed" && { error: status.errors?.[0]?.title ?? "WhatsApp couldn't deliver it." }),
            updatedAt: now,
          })
          .where(and(eq(reminders.providerMessageId, status.id), inArray(reminders.status, earlier)));
      }
      for (const message of value.messages ?? []) {
        if (message.type !== "text" || message.text?.body?.trim().toUpperCase() !== "STOP") continue;
        // The parent's choice covers every centre that messages them through Chukta.
        await deps.db
          .update(students)
          .set({ whatsappOptIn: false, whatsappOptInAt: null, updatedAt: now })
          .where(eq(students.parentPhone, `+${message.from}`));
      }
    }
    return c.json({ status: "ok" });
  });

  return routes;
}
