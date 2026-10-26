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

/** 400 with a message per field at fault, for forms to show beside each field. */
export const invalidFields = (fields: Record<string, string>) =>
  new ApiError(400, "invalid_request", "Check the highlighted fields.", { extra: { fields } });

/** Postgres unique_violation (23505), however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(err) === "23505" || code((err as { cause?: unknown } | undefined)?.cause) === "23505";
}

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
