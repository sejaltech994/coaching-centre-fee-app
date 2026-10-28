import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/harness";

type App = Awaited<ReturnType<typeof createTestApp>>;

const maths = { name: "Class 10 Maths", subject: "Mathematics", days: ["mon", "wed", "fri"], startTime: "16:00", endTime: "17:30" };

let app: App;
let token: string;

beforeEach(async () => {
  app = await createTestApp();
  token = (await app.login()).body.accessToken;
});

const create = (body: unknown, as = token) => app.call("POST", "/batches", { body, token: as });

describe("POST /batches", () => {
  it("creates an active batch in the owner's centre", async () => {
    const res = await create(maths);

    expect(res.status).toBe(201);
    const { batch } = await res.json();
    expect(batch).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Class 10 Maths",
      subject: "Mathematics",
      days: ["mon", "wed", "fri"],
      startTime: "16:00",
      endTime: "17:30",
      isActive: true,
      createdAt: "2026-11-02T04:30:00.000Z",
    });
  });

  it("names every field at fault", async () => {
    const res = await create({ name: "", days: [], startTime: "17:00", endTime: "16:00" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "Check the highlighted fields.",
        fields: {
          name: "Give the batch a name.",
          days: "Pick at least one day.",
          endTime: "The batch must end after it starts.",
        },
      },
    });
  });

  it("refuses a second active batch with the same name, ignoring case", async () => {
    await create({ ...maths, name: "Kathak juniors" });

    const res = await create({ ...maths, name: "kathak juniors" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "batch_name_taken", message: "You already have a batch called “kathak juniors”.", fields: { name: "You already have a batch called “kathak juniors”." } },
    });
  });

  it("requires a login", async () => {
    const res = await app.call("POST", "/batches", { body: maths });
    expect(res.status).toBe(401);
  });
});

describe("GET /batches", () => {
  it("lists active batches by name", async () => {
    for (const name of ["Yoga", "abacus", "Maths"]) await create({ ...maths, name });

    const res = await app.call("GET", "/batches", { token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches.map((b: { name: string }) => b.name)).toEqual(["abacus", "Maths", "Yoga"]);
    expect(body.nextCursor).toBeNull();
  });

  it("pages through batches with a cursor", async () => {
    for (const name of ["A", "B", "C"]) await create({ ...maths, name });

    const first = await (await app.call("GET", "/batches?limit=2", { token })).json();
    const second = await (await app.call("GET", `/batches?limit=2&cursor=${first.nextCursor}`, { token })).json();

    expect(first.batches.map((b: { name: string }) => b.name)).toEqual(["A", "B"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.batches.map((b: { name: string }) => b.name)).toEqual(["C"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by status", async () => {
    await create({ ...maths, name: "Current" });
    const old = (await (await create({ ...maths, name: "Old" })).json()).batch;
    await app.call("DELETE", `/batches/${old.id}`, { token });

    const names = async (status: string) =>
      (await (await app.call("GET", `/batches?status=${status}`, { token })).json()).batches.map(
        (b: { name: string }) => b.name,
      );

    expect(await names("active")).toEqual(["Current"]);
    expect(await names("archived")).toEqual(["Old"]);
    expect(await names("all")).toEqual(["Current", "Old"]);
  });

  it.each(["limit=0", "limit=101", "limit=x", "status=deleted", "cursor=not-a-cursor"])(
    "rejects a bad query (%s)",
    async (query) => {
      const res = await app.call("GET", `/batches?${query}`, { token });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    },
  );

  it("requires a login", async () => {
    expect((await app.call("GET", "/batches")).status).toBe(401);
  });
});

describe("GET /batches/:id", () => {
  it("returns the batch", async () => {
    const { batch } = await (await create(maths)).json();

    const res = await app.call("GET", `/batches/${batch.id}`, { token });

    expect(res.status).toBe(200);
    expect((await res.json()).batch).toEqual(batch);
  });

  it.each(["00000000-0000-4000-8000-000000000000", "not-a-uuid"])("answers 404 for an unknown id (%s)", async (id) => {
    const res = await app.call("GET", `/batches/${id}`, { token });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such batch." } });
  });
});

describe("PATCH /batches/:id", () => {
  it("changes only the fields sent", async () => {
    const { batch } = await (await create(maths)).json();

    const res = await app.call("PATCH", `/batches/${batch.id}`, { token, body: { startTime: "17:00", endTime: "18:00" } });

    expect(res.status).toBe(200);
    expect((await res.json()).batch).toEqual({ ...batch, startTime: "17:00", endTime: "18:00" });
  });

  it("checks the batch as a whole after the change", async () => {
    const { batch } = await (await create(maths)).json();

    const res = await app.call("PATCH", `/batches/${batch.id}`, { token, body: { endTime: "15:00" } });

    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ endTime: "The batch must end after it starts." });
  });

  it("can restore an archived batch", async () => {
    const { batch } = await (await create(maths)).json();
    await app.call("DELETE", `/batches/${batch.id}`, { token });

    const res = await app.call("PATCH", `/batches/${batch.id}`, { token, body: { isActive: true } });

    expect((await res.json()).batch.isActive).toBe(true);
  });

  it("refuses a rename onto another active batch's name", async () => {
    await create({ ...maths, name: "Yoga" });
    const { batch } = await (await create({ ...maths, name: "Pilates" })).json();

    const res = await app.call("PATCH", `/batches/${batch.id}`, { token, body: { name: "YOGA" } });

    expect(res.status).toBe(409);
  });

  it("rejects fields that can't be changed or don't exist", async () => {
    const { batch } = await (await create(maths)).json();
    const res = await app.call("PATCH", `/batches/${batch.id}`, { token, body: { id: "x", centreId: "y" } });
    expect(res.status).toBe(400);
  });

  it("answers 404 for an unknown id", async () => {
    const res = await app.call("PATCH", "/batches/00000000-0000-4000-8000-000000000000", { token, body: { name: "X" } });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /batches/:id", () => {
  it("archives the batch instead of deleting it", async () => {
    const { batch } = await (await create(maths)).json();

    const res = await app.call("DELETE", `/batches/${batch.id}`, { token });

    expect(res.status).toBe(200);
    expect((await res.json()).batch).toEqual({ ...batch, isActive: false });
    expect((await (await app.call("GET", `/batches/${batch.id}`, { token })).json()).batch.isActive).toBe(false);
  });

  it("answers 404 for an unknown id", async () => {
    expect((await app.call("DELETE", "/batches/00000000-0000-4000-8000-000000000000", { token })).status).toBe(404);
  });
});

// Each transaction costs several database round trips; on a distant database
// that is the difference between a fast and a slow save.
describe("database round trips", () => {
  it.each([
    ["PATCH", { name: "Renamed" }],
    ["DELETE", undefined],
  ])("%s /batches/:id reads and writes in one transaction", async (method, body) => {
    const { batch } = await (await create(maths)).json();
    const transaction = vi.spyOn(app.db, "transaction");

    const res = await app.call(method, `/batches/${batch.id}`, { token, body });

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("tenant isolation", () => {
  it("never lets one owner see, change or archive another owner's batch", async () => {
    const { batch } = await (await create({ ...maths, name: "Asha's batch" })).json();
    app.clock.advance(31_000);
    const ravi = (await app.login("ravi@example.com")).body.accessToken;

    expect((await app.call("GET", `/batches/${batch.id}`, { token: ravi })).status).toBe(404);
    expect((await app.call("PATCH", `/batches/${batch.id}`, { token: ravi, body: { name: "Mine" } })).status).toBe(404);
    expect((await app.call("DELETE", `/batches/${batch.id}`, { token: ravi })).status).toBe(404);
    expect((await (await app.call("GET", "/batches?status=all", { token: ravi })).json()).batches).toEqual([]);

    // Ravi can still use the same name in his own centre.
    expect((await create({ ...maths, name: "Asha's batch" }, ravi)).status).toBe(201);
    expect((await (await app.call("GET", `/batches/${batch.id}`, { token })).json()).batch.name).toBe("Asha's batch");
  });
});
