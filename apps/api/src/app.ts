import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Deps } from "./deps";
import { handleError, notFound } from "./lib/errors";
import { absenceAlertRoutes, attendanceRoutes } from "./modules/attendance/routes";
import { authRoutes } from "./modules/auth/routes";
import { batchRoutes } from "./modules/batches/routes";
import { centreRoutes } from "./modules/centre/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { feePlanRoutes } from "./modules/fee-plans/routes";
import { invoiceRoutes } from "./modules/invoices/routes";
import { fakeCheckoutRoutes, razorpaySettingsRoutes, razorpayWebhookRoutes } from "./modules/payments/razorpay";
import { paymentSettingsRoutes } from "./modules/payments/routes";
import { publicRoutes } from "./modules/public/routes";
import { receiptRoutes } from "./modules/receipts/routes";
import { reportRoutes } from "./modules/reports/routes";
import { fakeSubscriptionCheckout, subscriptionRoutes, subscriptionWebhookRoutes } from "./modules/subscription/routes";
import { reminderRoutes, reminderToneRoutes, whatsappWebhookRoutes } from "./modules/reminders/routes";
import { meRoutes } from "./modules/me/routes";
import { enrolmentRoutes, studentRoutes } from "./modules/students/routes";

/** The JSON API under /api/v1. See the TSD's API section. */
export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>().basePath("/api/v1");

  app.use(
    "*",
    cors({
      origin: (origin) => (deps.config.webOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowHeaders: ["content-type", "authorization", "idempotency-key"],
      maxAge: 600,
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));
  // Readiness for deploy smoke tests: the API can reach its database.
  app.get("/health/ready", async (c) => {
    try {
      await deps.db.execute(sql`select 1`);
      return c.json({ status: "ok", database: "ok" });
    } catch (err) {
      console.error("Readiness check failed:", err);
      return c.json({ status: "unavailable", database: "unreachable" }, 503);
    }
  });
  app.route("/auth", authRoutes(deps));
  app.route("/me", meRoutes(deps));
  app.route("/centre/payment-settings", paymentSettingsRoutes(deps));
  app.route("/centre/razorpay", razorpaySettingsRoutes(deps));
  app.route("/centre/reminder-tone", reminderToneRoutes(deps));
  app.route("/centre/absence-alerts", absenceAlertRoutes(deps));
  app.route("/centre", centreRoutes(deps));
  app.route("/batches", batchRoutes(deps));
  app.route("/fee-plans", feePlanRoutes(deps));
  app.route("/students", studentRoutes(deps));
  app.route("/enrolments", enrolmentRoutes(deps));
  app.route("/invoices", invoiceRoutes(deps));
  app.route("/receipts", receiptRoutes(deps));
  app.route("/reminders", reminderRoutes(deps));
  app.route("/dashboard", dashboardRoutes(deps));
  app.route("/attendance", attendanceRoutes(deps));
  app.route("/subscription", subscriptionRoutes(deps));
  app.route("/reports", reportRoutes(deps));
  // No sign-in: a parent's pay link and receipt, keyed by the bill's secret token.
  app.route("/public", publicRoutes(deps));
  // Signed by each centre's own Razorpay webhook secret.
  app.route("/webhooks/razorpay", razorpayWebhookRoutes(deps));
  // Signed by Meta with the WhatsApp app secret.
  app.route("/webhooks/whatsapp", whatsappWebhookRoutes(deps));
  // Only with RAZORPAY_PROVIDER=fake (never production): the test checkout.
  app.route("/webhooks/chukta-razorpay", subscriptionWebhookRoutes(deps));
  app.route("/dev/fake-razorpay/subscriptions", fakeSubscriptionCheckout(deps));
  app.route("/dev/fake-razorpay", fakeCheckoutRoutes(deps));

  app.notFound(notFound);
  app.onError(handleError);
  return app;
}
