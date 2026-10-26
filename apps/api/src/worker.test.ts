import type { Database, DbHandle } from "@chukta/db";
import { createTestDb } from "@chukta/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createWorker, type WorkerEnv } from "./worker";

const SITE = "https://chukta-web-dev.chukta.workers.dev";

let db: Database;
let close: Mock<() => Promise<void>>;
let makeDb: Mock<(url: string) => DbHandle>;
let assets: Mock<(request: Request) => Promise<Response>>;

const env = (overrides: Partial<WorkerEnv> = {}): WorkerEnv => ({
  NODE_ENV: "staging",
  DATABASE_URL: "postgres://user:pass@db.example/neondb",
  JWT_SECRET: "worker-test-secret-that-is-at-least-32-chars",
  WEB_ORIGINS: SITE,
  TRUST_PROXY_HEADERS: "true",
  ASSETS: { fetch: assets },
  ...overrides,
});
const ctx = () => ({ waitUntil: vi.fn() });

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Database;
  close = vi.fn(async () => {});
  makeDb = vi.fn((): DbHandle => ({ db, close, kind: "postgres" }));
  assets = vi.fn(async () => new Response("<html>site</html>", { headers: { "content-type": "text/html" } }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown) =>
  new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" },
    body: JSON.stringify(body),
  });

describe("Cloudflare Worker", () => {
  it("serves the website for everything outside /api, without touching the database", async () => {
    const worker = createWorker(makeDb);
    const request = new Request(`${SITE}/batches/`);

    const res = await worker.fetch(request, env(), ctx());

    expect(await res.text()).toBe("<html>site</html>");
    expect(assets).toHaveBeenCalledWith(request);
    expect(makeDb).not.toHaveBeenCalled();
  });

  it("answers the API on the same origin, with one database pool per request, closed afterwards", async () => {
    const worker = createWorker(makeDb);
    const context = ctx();

    const res = await worker.fetch(new Request(`${SITE}/api/v1/health`), env(), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(makeDb).toHaveBeenCalledWith("postgres://user:pass@db.example/neondb");
    expect(close).toHaveBeenCalledOnce();
    expect(context.waitUntil).toHaveBeenCalledOnce();
    expect(assets).not.toHaveBeenCalled();
  });

  it("logs an owner in end to end, with a Secure cookie", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const worker = createWorker(makeDb);

    const requested = await worker.fetch(post("/api/v1/auth/otp/request", { phone: "9876543210" }), env(), ctx());
    expect(requested.status).toBe(202);
    // Hosted dev uses the console SMS provider: the code is in the Worker's log.
    const code = /: (\d{6}) /.exec(String(info.mock.calls.at(-1)?.[0]))?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const verified = await worker.fetch(post("/api/v1/auth/otp/verify", { phone: "9876543210", code }), env(), ctx());
    expect(verified.status).toBe(200);
    expect(verified.headers.get("set-cookie")).toContain("Secure");
  });

  it("refuses to serve the API without its secrets, and says so only in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = createWorker(makeDb);

    const res = await worker.fetch(new Request(`${SITE}/api/v1/health`), env({ JWT_SECRET: undefined }), ctx());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "misconfigured", message: "The service is not configured." } });
    expect(String(error.mock.calls[0])).toContain("JWT_SECRET");
    expect(makeDb).not.toHaveBeenCalled();
  });

  it("still serves the website when the API is misconfigured", async () => {
    const worker = createWorker(makeDb);
    const res = await worker.fetch(new Request(`${SITE}/`), env({ DATABASE_URL: undefined }), ctx());
    expect(res.status).toBe(200);
  });
});
