import type { Context } from "hono";
import type { z } from "zod";
import { invalidRequest } from "./errors";

/** Parses and validates a JSON body, or fails with 400 invalid_request. */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw invalidRequest("The request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

/** The caller's IP for rate limiting. Proxy headers are trusted only when configured. */
export function clientIp(c: Context, trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    const forwarded = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? "unknown";
}
