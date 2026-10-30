import { receipts, withCentre } from "@chukta/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../../deps";
import { ApiError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { findReceipt, pdfResponse, receiptData } from "./data";
import { renderReceipt } from "./pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new ApiError(404, "not_found", "No such receipt.");

/** TSD: GET /receipts/:id/pdf, for the owner. */
export function receiptRoutes(deps: Deps) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireAuth(deps));

  routes.get("/:id/pdf", async (c) => {
    const { centreId } = c.var.auth;
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const row = await withCentre(deps.db, centreId, (tx) => findReceipt(tx, and(eq(receipts.id, id), eq(receipts.centreId, centreId))!));
    if (!row) throw notFound();
    const data = await receiptData(deps.db, row);
    return pdfResponse(await renderReceipt(data), data.number);
  });

  return routes;
}
