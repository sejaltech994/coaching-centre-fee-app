import { paymentLinks, paymentSettings, webhookEvents, withCentre } from "@chukta/db";
import { verifyRazorpaySignature, type FakeGateway, type GatewayKeys, type GatewayPayment } from "@chukta/integrations";
import { formatRupees } from "@chukta/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { ApiError, invalidFields, isUniqueViolation } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { openSecret, sealSecret } from "../../lib/secrets";
import { requireAuth } from "../../middleware/auth";
import { recordPayment, type PaymentMethod } from "./record";

/**
 * The centre's own Razorpay account (TSD: Payments): keys stored encrypted,
 * Payment Links made on the centre's account, and its webhooks and an hourly
 * reconcile marking bills paid. Money settles to the centre, never to Chukta.
 */

export type CentreRazorpay = GatewayKeys & { webhookSecret: string };

/** Where Razorpay should send the centre's webhooks (set in their Razorpay dashboard). */
export const webhookUrl = (deps: Deps, centreId: string) => `${deps.config.webOrigins[0]}/api/v1/webhooks/razorpay/${centreId}`;

/** The centre's Razorpay keys, decrypted, or null when it hasn't connected Razorpay. */
export async function centreRazorpay(deps: Deps, centreId: string): Promise<CentreRazorpay | null> {
  const [row] = await deps.db.select().from(paymentSettings).where(eq(paymentSettings.centreId, centreId));
  if (!row?.razorpayKeyId || !row.razorpayKeySecret || !row.razorpayWebhookSecret) return null;
  return {
    keyId: row.razorpayKeyId,
    keySecret: await openSecret(deps.config.jwtSecret, row.razorpayKeySecret),
    webhookSecret: await openSecret(deps.config.jwtSecret, row.razorpayWebhookSecret),
  };
}

const GATEWAY_METHODS: PaymentMethod[] = ["upi", "card", "netbanking", "wallet"];

/**
 * A payment Razorpay reports (by webhook, the reconcile or the fake checkout):
 * the bill is recorded paid with a receipt. Already paid (say, in cash) or this
 * payment already recorded: nothing changes.
 */
export async function applyGatewayPayment(
  deps: Deps,
  input: { centreId: string; invoiceId: string; payment: GatewayPayment; linkId?: string },
): Promise<void> {
  const now = deps.now();
  const method = GATEWAY_METHODS.find((m) => m === input.payment.method) ?? "card";
  try {
    await withCentre(deps.db, input.centreId, async (tx) => {
      if (input.linkId) {
        await tx.update(paymentLinks).set({ status: "paid", updatedAt: now }).where(eq(paymentLinks.gatewayLinkId, input.linkId));
      }
      await recordPayment(tx, {
        centreId: input.centreId,
        invoiceId: input.invoiceId,
        method,
        reference: input.payment.id,
        gatewayPaymentId: input.payment.id,
        receivedAt: now,
        recordedBy: null,
        now,
      });
    });
  } catch (err) {
    const closed = err instanceof ApiError && (err.code === "invoice_closed" || err.code === "not_found");
    if (!closed && !isUniqueViolation(err)) throw err;
    console.warn(`Razorpay payment ${input.payment.id} not recorded for bill ${input.invoiceId}: ${(err as Error).message}`);
  }
}

/** Hourly: asks Razorpay about the centre's open links, in case a webhook was missed (TSD: reconcile-payments). */
export async function reconcileRazorpay(deps: Deps, centreId: string): Promise<void> {
  const keys = await centreRazorpay(deps, centreId);
  if (!keys) return;
  const open = await withCentre(deps.db, centreId, (tx) =>
    tx.select().from(paymentLinks).where(and(eq(paymentLinks.centreId, centreId), eq(paymentLinks.status, "created"))),
  );
  for (const link of open) {
    const state = await deps.gateway.fetchPaymentLink(keys, link.gatewayLinkId);
    if (state.status === "paid" && state.payment) {
      await applyGatewayPayment(deps, { centreId, invoiceId: link.invoiceId, payment: state.payment, linkId: link.gatewayLinkId });
    } else if (state.status !== "created") {
      await withCentre(deps.db, centreId, (tx) =>
        tx.update(paymentLinks).set({ status: state.status, updatedAt: deps.now() }).where(eq(paymentLinks.id, link.id)),
      );
    }
  }
}

/** Centres that have connected Razorpay, for the reconcile. */
export async function razorpayCentres(deps: Deps): Promise<string[]> {
  const rows = await deps.db
    .select({ centreId: paymentSettings.centreId })
    .from(paymentSettings)
    .where(isNotNull(paymentSettings.razorpayKeyId));
  return rows.map((r) => r.centreId);
}

const connectBody = z.object({ keyId: z.unknown(), keySecret: z.unknown(), webhookSecret: z.unknown() }).partial();
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** PUT and DELETE /centre/razorpay: connect or disconnect the centre's own account. */
export function razorpaySettingsRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.put("/", async (c) => {
    const body = await readJson(c, connectBody);
    const keys = { keyId: text(body.keyId), keySecret: text(body.keySecret), webhookSecret: text(body.webhookSecret) };
    const fields: Record<string, string> = {};
    if (!/^rzp_(live|test)_\w+$/.test(keys.keyId)) fields.keyId = "Enter the key ID from Razorpay, starting rzp_live_ or rzp_test_.";
    if (!keys.keySecret) fields.keySecret = "Enter the key secret.";
    if (!keys.webhookSecret) fields.webhookSecret = "Enter the webhook secret you set in Razorpay.";
    if (Object.keys(fields).length > 0) throw invalidFields(fields);
    if (!(await deps.gateway.verifyCredentials(keys))) {
      throw invalidFields({ keySecret: "Razorpay didn’t accept these keys. Check the key ID and secret." });
    }

    const { centreId } = c.var.auth;
    const now = deps.now();
    const sealed = {
      razorpayKeyId: keys.keyId,
      razorpayKeySecret: await sealSecret(deps.config.jwtSecret, keys.keySecret),
      razorpayWebhookSecret: await sealSecret(deps.config.jwtSecret, keys.webhookSecret),
    };
    await withCentre(deps.db, centreId, (tx) =>
      tx
        .insert(paymentSettings)
        .values({ centreId, ...sealed, createdAt: now })
        .onConflictDoUpdate({ target: paymentSettings.centreId, set: { ...sealed, updatedAt: now } }),
    );
    return c.json({ razorpay: { keyId: keys.keyId, webhookUrl: webhookUrl(deps, centreId) } });
  });

  routes.delete("/", async (c) => {
    const { centreId } = c.var.auth;
    await withCentre(deps.db, centreId, (tx) =>
      tx
        .update(paymentSettings)
        .set({ razorpayKeyId: null, razorpayKeySecret: null, razorpayWebhookSecret: null, updatedAt: deps.now() })
        .where(eq(paymentSettings.centreId, centreId)),
    );
    return c.body(null, 204);
  });

  return routes;
}

type PaidEvent = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; notes?: { invoice_id?: string } } };
    payment?: { entity?: { id?: string; method?: string } };
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /webhooks/razorpay/:centreId: signature checked with that centre's secret, stored once, then applied. */
export function razorpayWebhookRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();

  routes.post("/:centreId", async (c) => {
    const centreId = c.req.param("centreId");
    const keys = UUID.test(centreId) ? await centreRazorpay(deps, centreId) : null;
    if (!keys) throw new ApiError(404, "not_found", "No Razorpay account here.");
    const raw = await c.req.text();
    const signature = c.req.header("x-razorpay-signature") ?? "";
    if (!(await verifyRazorpaySignature(raw, signature, keys.webhookSecret))) {
      throw new ApiError(401, "bad_signature", "The webhook signature doesn't match.");
    }

    let event: PaidEvent;
    try {
      event = JSON.parse(raw) as PaidEvent;
    } catch {
      throw new ApiError(400, "invalid_request", "The webhook body isn't JSON.");
    }
    const eventId = c.req.header("x-razorpay-event-id") ?? `${event.event}:${event.payload?.payment?.entity?.id ?? raw.length}`;
    const stored = await deps.db
      .insert(webhookEvents)
      .values({ source: "razorpay", eventId, centreId, payload: event, createdAt: deps.now() })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (stored.length === 0) return c.json({ status: "duplicate" });

    const invoiceId = event.payload?.payment_link?.entity?.notes?.invoice_id;
    const payment = event.payload?.payment?.entity;
    if (event.event === "payment_link.paid" && invoiceId && UUID.test(invoiceId) && payment?.id) {
      await applyGatewayPayment(deps, {
        centreId,
        invoiceId,
        payment: { id: payment.id, method: payment.method ?? "card" },
        linkId: event.payload?.payment_link?.entity?.id,
      });
    }
    await deps.db.update(webhookEvents).set({ processedAt: deps.now() }).where(eq(webhookEvents.id, stored[0]!.id));
    return c.json({ status: "ok" });
  });

  return routes;
}

const isFake = (gateway: Deps["gateway"]): gateway is FakeGateway => "pay" in gateway;

/** The fake gateway's checkout pages, for local runs and tests only. */
export function fakeCheckoutRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  const fake = isFake(deps.gateway) ? deps.gateway : null;
  if (!fake) return routes;

  routes.get("/:id", (c) => {
    const link = fake.link(c.req.param("id"));
    if (!link) throw new ApiError(404, "not_found", "No such fake payment link.");
    return c.html(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fake Razorpay checkout</title>` +
        `<main style="font-family:system-ui;max-width:420px;margin:48px auto"><h1>Test checkout</h1>` +
        `<p>${link.description.replace(/[<>&]/g, "")}</p><p style="font-size:28px">${formatRupees(link.amountPaise)}</p>` +
        `<form method="post" action="${c.req.path}/pay"><button style="font-size:18px">Pay ${formatRupees(link.amountPaise)} (test)</button></form></main>`,
    );
  });

  routes.post("/:id/pay", async (c) => {
    const id = c.req.param("id");
    const link = fake.link(id);
    if (!link) throw new ApiError(404, "not_found", "No such fake payment link.");
    const payment = fake.pay(id);
    const [row] = await deps.db.select().from(paymentLinks).where(eq(paymentLinks.gatewayLinkId, id));
    if (row) await applyGatewayPayment(deps, { centreId: row.centreId, invoiceId: link.invoiceId, payment, linkId: id });
    return c.redirect(link.callbackUrl, 303);
  });

  return routes;
}
