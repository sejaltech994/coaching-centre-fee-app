import { paymentSettings, withCentre } from "@chukta/db";
import { validatePaymentSettings } from "@chukta/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../../deps";
import { invalidFields } from "../../lib/errors";
import { readJson } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { webhookUrl } from "./razorpay";

const body = z.object({ upiId: z.unknown(), payeeName: z.unknown() }).partial();

/** The centre's own UPI ID, which parents pay straight into (TSD: Settings › Payments). */
export function paymentSettingsRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/", async (c) => {
    const { centreId } = c.var.auth;
    const [row] = await withCentre(deps.db, centreId, (tx) =>
      tx.select().from(paymentSettings).where(eq(paymentSettings.centreId, centreId)),
    );
    return c.json({
      paymentSettings: {
        upiId: row?.upiId ?? null,
        payeeName: row?.payeeName ?? null,
        razorpay: row?.razorpayKeyId ? { keyId: row.razorpayKeyId, webhookUrl: webhookUrl(deps, centreId) } : null,
      },
    });
  });

  routes.put("/", async (c) => {
    const checked = validatePaymentSettings(await readJson(c, body));
    if (!checked.ok) throw invalidFields(checked.fields);
    const { centreId } = c.var.auth;
    const now = deps.now();
    await withCentre(deps.db, centreId, (tx) =>
      tx
        .insert(paymentSettings)
        .values({ centreId, ...checked.value, createdAt: now })
        .onConflictDoUpdate({ target: paymentSettings.centreId, set: { ...checked.value, updatedAt: now } }),
    );
    return c.json({ paymentSettings: checked.value });
  });

  return routes;
}
