import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An expected failure, sent as `{ "error": { "code", "message", ...extra } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly options: { extra?: Record<string, unknown>; retryAfterSeconds?: number } = {},
  ) {
    super(message);
  }
}

export const unauthenticated = () => new ApiError(401, "unauthenticated", "Log in to continue.");
export const invalidRequest = (message = "The request is not valid.") => new ApiError(400, "invalid_request", message);

export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    if (err.options.retryAfterSeconds !== undefined) c.header("Retry-After", String(err.options.retryAfterSeconds));
    return c.json({ error: { code: err.code, message: err.message, ...err.options.extra } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
}

export function notFound(c: Context) {
  return c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404);
}
