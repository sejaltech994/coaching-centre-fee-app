import type { Database, DbHandle } from "@chukta/db";
import { createTestDb } from "@chukta/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { centres } from "@chukta/db";
import { PROFILE } from "./test/harness";
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

  it("connects through Hyperdrive's pooled connections when bound, instead of DATABASE_URL", async () => {
    const worker = createWorker(makeDb);
    const hyperdrive = { connectionString: "postgres://user:pass@hyperdrive.local:5432/chukta_dev" };

    const res = await worker.fetch(new Request(`${SITE}/api/v1/health/ready`), env({ HYPERDRIVE: hyperdrive }), ctx());

    expect(res.status).toBe(200);
    expect(makeDb).toHaveBeenCalledWith("postgres://user:pass@hyperdrive.local:5432/chukta_dev");
  });

  it("runs on Hyperdrive alone, without a DATABASE_URL secret", async () => {
    const worker = createWorker(makeDb);
    const hyperdrive = { connectionString: "postgres://user:pass@hyperdrive.local:5432/chukta_dev" };

    const res = await worker.fetch(
      new Request(`${SITE}/api/v1/health`),
      env({ HYPERDRIVE: hyperdrive, DATABASE_URL: undefined }),
      ctx(),
    );

    expect(res.status).toBe(200);
  });

  it("signs an owner up end to end through Google, with Secure cookies", async () => {
    const worker = createWorker(makeDb);
    const google = env({ GOOGLE_PROVIDER: "fake" });
    const get = (url: string, cookie = "") => worker.fetch(new Request(url, { headers: { cookie } }), google, ctx());
    const cookie = (res: Response, name: string) =>
      res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))!.split(";")[0]!;

    const started = await get(`${SITE}/api/v1/auth/google/start`);
    expect(started.headers.get("set-cookie")).toContain("Secure");
    const chooser = new URL(started.headers.get("location")!);
    const approve = new URL("/api/v1/auth/google/fake/approve", SITE);
    for (const key of ["redirect_uri", "state", "nonce"]) approve.searchParams.set(key, chooser.searchParams.get(key)!);
    approve.searchParams.set("email", "asha@example.com");
    const callback = (await get(approve.href)).headers.get("location")!;

    const signedIn = await get(callback, cookie(started, "chukta_oauth"));
    expect(signedIn.headers.get("location")).toBe(`${SITE}/signup/`);

    const registered = await worker.fetch(
      new Request(`${SITE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookie(signedIn, "chukta_google") },
        body: JSON.stringify(PROFILE),
      }),
      google,
      ctx(),
    );
    expect(registered.status).toBe(201);
    expect(registered.headers.get("set-cookie")).toContain("Secure");
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

describe("Cloudflare Worker, on its hourly Cron Trigger", () => {
  it("runs the scheduled jobs against the environment's database, then closes it", async () => {
    const worker = createWorker(makeDb);
    const select = vi.spyOn(db, "select");
    await db.insert(centres).values({});

    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env(), ctx());

    expect(makeDb).toHaveBeenCalledWith("postgres://user:pass@db.example/neondb");
    // It read the centres to bill, and closed the connection afterwards.
    expect(select).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and says why in the log, when the API isn't configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = createWorker(makeDb);

    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env({ JWT_SECRET: undefined }), ctx());

    expect(makeDb).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0])).toContain("JWT_SECRET");
  });
});
