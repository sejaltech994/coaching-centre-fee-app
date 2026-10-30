import { centres, students, webhookEvents, withCentre, type Tx } from "@chukta/db";
import { verifyRazorpaySignature, type FakeGateway } from "@chukta/integrations";
import { formatRupees, PLANS, PRO_PRICE_PAISE, studentLimitReached, type Plan } from "@chukta/shared";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { ApiError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";

/**
 * Chukta's own Free and Pro plans (TSD: subscription billing). Pro is a Razorpay
 * Subscription on Chukta's own account, the one place Chukta takes money: its
 * own fee. Razorpay's webhooks keep the plan and its renewal date.
 */

type SubscriptionStatus = "created" | "active" | "cancelled" | "halted";

export const planRequired = (message: string) => new ApiError(402, "plan_limit", message);

export async function centrePlan(deps: Deps, centreId: string): Promise<Plan> {
  const [row] = await deps.db.select({ plan: centres.plan }).from(centres).where(eq(centres.id, centreId));
  return row?.plan ?? "free";
}

async function activeStudents(tx: Tx, centreId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(students)
    .where(and(eq(students.centreId, centreId), eq(students.status, "active")));
  return row!.count;
}

/** Throws 402 when a Free centre already has as many active students as Free covers. */
export async function ensureStudentPlace(tx: Tx, centreId: string, plan: Plan): Promise<void> {
  if (studentLimitReached(plan, await activeStudents(tx, centreId))) {
    throw planRequired(`Free covers up to ${PLANS.free.maxStudents} students. Go Pro for more.`);
  }
}

/** A subscription event from Razorpay (webhook or the fake checkout) applied to its centre. */
export async function applySubscription(
  deps: Deps,
  input: { centreId: string; subscriptionId: string; status: SubscriptionStatus; currentEnd?: Date },
): Promise<void> {
  const now = deps.now();
  const active = input.status === "active";
  await deps.db
    .update(centres)
    .set({
      subscriptionId: input.subscriptionId,
      subscriptionStatus: input.status,
      // Active (or renewed): Pro until the period's end. Cancelled or halted:
      // Pro stays until then; the hourly job moves the centre back to Free.
      ...(active && { plan: "pro" as const }),
      ...(input.currentEnd && { planRenewsAt: input.currentEnd }),
      updatedAt: now,
    })
    .where(eq(centres.id, input.centreId));
}

/** Hourly: centres whose Pro was cancelled or failed, past the period they paid for, go back to Free. */
export async function endLapsedPro(deps: Deps): Promise<void> {
  await deps.db
    .update(centres)
    .set({ plan: "free", updatedAt: deps.now() })
    .where(
      and(
        eq(centres.plan, "pro"),
        inArray(centres.subscriptionStatus, ["cancelled", "halted"]),
        lte(centres.planRenewsAt, deps.now()),
      ),
    );
}

const unavailable = () => new ApiError(503, "upgrade_unavailable", "Upgrading isn't available here yet.");

export function subscriptionRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    const { centreId } = c.var.auth;
    const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
    const active = await withCentre(deps.db, centreId, (tx) => activeStudents(tx, centreId));
    return c.json({
      plan: centre!.plan,
      status: centre!.subscriptionStatus,
      renewsAt: centre!.planRenewsAt?.toISOString() ?? null,
      proPricePaise: PRO_PRICE_PAISE,
      canUpgrade: deps.config.proPlan !== null,
      students: { active, max: PLANS[centre!.plan].maxStudents },
    });
  });

  /** Starts a Pro subscription on Chukta's account; the owner pays on Razorpay's checkout. */
  routes.post("/", async (c) => {
    const pro = deps.config.proPlan;
    if (!pro) throw unavailable();
    const { centreId } = c.var.auth;
    const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
    if (centre!.plan === "pro" && centre!.subscriptionStatus === "active") {
      throw new ApiError(409, "already_pro", "This centre is already on Pro.");
    }
    const subscription = await deps.gateway.createSubscription(pro, { planId: pro.planId, notes: { centre_id: centreId } });
    await applySubscription(deps, { centreId, subscriptionId: subscription.id, status: "created" });
    return c.json({ url: subscription.shortUrl });
  });

  /** Stops renewing; Pro lasts until the end of the period already paid for. */
  routes.post("/cancel", async (c) => {
    const pro = deps.config.proPlan;
    const { centreId } = c.var.auth;
    const [centre] = await deps.db.select().from(centres).where(eq(centres.id, centreId));
    if (!pro || !centre?.subscriptionId || centre.subscriptionStatus !== "active") {
      throw new ApiError(409, "no_subscription", "There's no Pro subscription to cancel.");
    }
    await deps.gateway.cancelSubscription(pro, centre.subscriptionId);
    await applySubscription(deps, { centreId, subscriptionId: centre.subscriptionId, status: "cancelled" });
    return c.json({ plan: "pro", status: "cancelled", renewsAt: centre.planRenewsAt?.toISOString() ?? null });
  });

  return routes;
}

type SubscriptionEvent = {
  event?: string;
  payload?: { subscription?: { entity?: { id?: string; current_end?: number; notes?: { centre_id?: string } } } };
};

const EVENT_STATUS: Record<string, SubscriptionStatus> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.cancelled": "cancelled",
  "subscription.halted": "halted",
};

/** POST /webhooks/chukta-razorpay: subscription events on Chukta's own account. */
export function subscriptionWebhookRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.post("/", async (c) => {
    const pro = deps.config.proPlan;
    if (!pro) throw unavailable();
    const raw = await c.req.text();
    if (!(await verifyRazorpaySignature(raw, c.req.header("x-razorpay-signature") ?? "", pro.webhookSecret))) {
      throw new ApiError(401, "bad_signature", "The webhook signature doesn't match.");
    }
    const event = JSON.parse(raw) as SubscriptionEvent;
    const now = deps.now();
    const eventId = c.req.header("x-razorpay-event-id") ?? `${event.event}:${event.payload?.subscription?.entity?.id}`;
    const stored = await deps.db
      .insert(webhookEvents)
      .values({ source: "chukta-razorpay", eventId, payload: event, processedAt: now, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    const entity = event.payload?.subscription?.entity;
    const status = EVENT_STATUS[event.event ?? ""];
    const centreId = entity?.notes?.centre_id;
    if (stored.length > 0 && status && entity?.id && centreId) {
      await applySubscription(deps, {
        centreId,
        subscriptionId: entity.id,
        status,
        ...(entity.current_end && { currentEnd: new Date(entity.current_end * 1000) }),
      });
    }
    return c.json({ status: "ok" });
  });
  return routes;
}

/** The fake checkout for Pro (RAZORPAY_PROVIDER=fake only). */
export function fakeSubscriptionCheckout(deps: Deps) {
  const routes = new Hono<AppEnv>();
  const fake = "paySubscription" in deps.gateway ? (deps.gateway as FakeGateway) : null;
  if (!fake) return routes;

  routes.get("/:id", (c) => {
    if (!fake.subscription(c.req.param("id"))) throw new ApiError(404, "not_found", "No such fake subscription.");
    const price = formatRupees(PRO_PRICE_PAISE);
    return c.html(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fake Razorpay checkout</title>` +
        `<main style="font-family:system-ui;max-width:420px;margin:48px auto"><h1>Chukta Pro (test)</h1><p style="font-size:28px">${price} / month</p>` +
        `<form method="post" action="${c.req.path}/pay"><button style="font-size:18px">Subscribe for ${price} (test)</button></form></main>`,
    );
  });

  routes.post("/:id/pay", async (c) => {
    const id = c.req.param("id");
    const subscription = fake.subscription(id);
    if (!subscription) throw new ApiError(404, "not_found", "No such fake subscription.");
    const { currentEnd } = fake.paySubscription(id, deps.now());
    await applySubscription(deps, { centreId: subscription.notes.centre_id!, subscriptionId: id, status: "active", currentEnd });
    return c.redirect(`${deps.config.webOrigins[0]}/settings/`, 303);
  });

  return routes;
}
