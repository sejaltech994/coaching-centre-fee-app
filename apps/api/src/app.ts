import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Deps } from "./deps";
import { handleError, notFound } from "./lib/errors";
import { authRoutes } from "./modules/auth/routes";
import { batchRoutes } from "./modules/batches/routes";
import { centreRoutes } from "./modules/centre/routes";

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
  app.route("/auth", authRoutes(deps));
  app.route("/centre", centreRoutes(deps));
  app.route("/batches", batchRoutes(deps));

  app.notFound(notFound);
  app.onError(handleError);
  return app;
}
