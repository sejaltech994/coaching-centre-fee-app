import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { AARAV, DAY, owner } from "../../test/owner";

describe("billing", () => {
  it("bills a student for this month as soon as they join a batch with a fee plan", async () => {
    const { list, studentId, batch } = await owner();

    const { invoices, nextCursor } = await list();

    expect(nextCursor).toBeNull();
    expect(invoices).toEqual([
      {
        id: expect.any(String),
        number: 1,
        student: { id: studentId, name: "Aarav Sharma", parentName: "Neha Sharma" },
        batch: { id: batch, name: "Class 10 Maths" },
        cycle: "monthly",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        dueDate: "2026-11-05",
        amountPaise: 250000,
        discountPaise: 0,
        lateFeePaise: 0,
        totalPaise: 250000,
        status: "pending",
        paidAt: null,
        waivedAt: null,
        waiveReason: null,
        payment: null,
        payLink: expect.stringMatching(/^http:\/\/localhost:3000\/pay\/\?t=[0-9a-f]{32}$/),
        createdAt: "2026-11-02T04:30:00.000Z",
      },
    ]);
  });

  it("bills nothing for a batch without a fee plan", async () => {
    const { json, list } = await owner();
    const free = (await json("POST", "/batches", { name: "Free trial", days: ["tue"], startTime: "16:00", endTime: "17:00" })).batch.id;
    await json("POST", "/students", { ...AARAV, name: "Diya", batchIds: [free] });

    expect((await list()).invoices).toHaveLength(1);
  });

  it("makes next month's bill a week ahead, less the student's discount, and only once", async () => {
    const { app, call, advance, enrolmentId, list } = await owner();
    await call("PATCH", `/enrolments/${enrolmentId}`, { discountPaise: 50000 });

    await advance(22 * DAY); // 24 Nov: December starts within 7 days
    await app.runJobs();
    await app.runJobs();

    const { invoices } = await list("?status=all");
    expect(invoices.map((i: { number: number; periodStart: string; amountPaise: number; discountPaise: number }) => [i.number, i.periodStart, i.amountPaise, i.discountPaise])).toEqual([
      [2, "2026-12-01", 200000, 50000],
      [1, "2026-11-01", 250000, 0],
    ]);
  });

  it("marks an unpaid bill overdue after its due date, and adds the late fee once after the grace days", async () => {
    const { app, advance, list } = await owner();

    await advance(3 * DAY); // 5 Nov, the due date
    await app.runJobs();
    expect((await list()).invoices[0]).toMatchObject({ status: "pending", lateFeePaise: 0 });

    await advance(DAY); // 6 Nov
    await app.runJobs();
    expect((await list()).invoices[0]).toMatchObject({ status: "overdue", lateFeePaise: 0, totalPaise: 250000 });

    await advance(3 * DAY); // 9 Nov, past the 3 grace days
    await app.runJobs();
    await app.runJobs();
    expect((await list()).invoices[0]).toMatchObject({ status: "overdue", lateFeePaise: 10000, totalPaise: 260000 });
  });

  it("drops unpaid bills for periods after a student leaves the batch", async () => {
    const { app, call, advance, enrolmentId, list } = await owner();
    await advance(22 * DAY);
    await app.runJobs();

    await call("PATCH", `/enrolments/${enrolmentId}`, { endDate: "2026-11-30" });

    expect((await list("?status=all")).invoices.map((i: { periodStart: string }) => i.periodStart)).toEqual(["2026-11-01"]);
  });
});

describe("GET /invoices", () => {
  it("filters by status, due month, student and batch", async () => {
    const { app, json, advance, batch, studentId, list } = await owner();
    await advance(22 * DAY);
    await app.runJobs();
    await advance(14 * DAY); // 8 Dec: November and December (due the 5th) overdue
    await app.runJobs();
    // Diya joins on 8 Dec, so her December bill is due today: pending.
    const diya = (await json("POST", "/students", { ...AARAV, name: "Diya", batchIds: [batch] })).student.id;

    const numbers = async (query: string) => (await list(query)).invoices.map((i: { number: number }) => i.number);
    expect(await numbers("")).toEqual([3, 2, 1]);
    expect(await numbers("?status=overdue")).toEqual([2, 1]);
    expect(await numbers("?status=pending")).toEqual([3]);
    expect(await numbers("?status=paid")).toEqual([]);
    expect(await numbers("?status=all&month=2026-11")).toEqual([1]);
    expect(await numbers(`?status=all&studentId=${diya}`)).toEqual([3]);
    expect(await numbers(`?status=all&studentId=${studentId}&batchId=${batch}`)).toEqual([2, 1]);
  });

  it("pages through the list", async () => {
    const { app, advance, list } = await owner();
    await advance(22 * DAY);
    await app.runJobs();

    const first = await list("?status=all&limit=1");
    const second = await list(`?status=all&limit=1&cursor=${first.nextCursor}`);

    expect([first.invoices[0].number, second.invoices[0].number, second.nextCursor]).toEqual([2, 1, null]);
  });

  it.each(["?status=lost", "?month=November", "?limit=0", "?cursor=nope", "?batchId=x"])("refuses %s", async (query) => {
    const { call } = await owner();
    expect((await call("GET", `/invoices${query}`)).status).toBe(400);
  });

  it("shows an owner only their own centre's bills", async () => {
    const asha = await owner();
    const ravi = await owner("ravi@example.com", asha.app);
    const [ashas] = (await asha.list()).invoices;

    expect((await ravi.list("?status=all")).invoices).toHaveLength(1);
    expect((await ravi.call("GET", `/invoices/${ashas.id}`)).status).toBe(404);
    expect((await ravi.call("POST", `/invoices/${ashas.id}/waive`, { reason: "x" })).status).toBe(404);
  });

  it("needs an access token", async () => {
    const app = await createTestApp();
    expect((await app.call("GET", "/invoices")).status).toBe(401);
  });
});

describe("GET /invoices/:id", () => {
  it("returns one bill", async () => {
    const { call, list } = await owner();
    const [bill] = (await list()).invoices;

    const res = await call("GET", `/invoices/${bill.id}`);

    expect(res.status).toBe(200);
    expect((await res.json()).invoice).toEqual(bill);
  });

  it("is 404 for a bill that doesn't exist", async () => {
    const { call } = await owner();
    for (const id of ["nope", "00000000-0000-4000-8000-000000000000"]) {
      expect((await call("GET", `/invoices/${id}`)).status).toBe(404);
    }
  });
});

describe("POST /invoices/:id/waive", () => {
  it("waives a bill with a reason, noting when", async () => {
    const { app, call, advance, list } = await owner();
    const [bill] = (await list()).invoices;

    const res = await call("POST", `/invoices/${bill.id}/waive`, { reason: "  Sibling scholarship " });

    expect(res.status).toBe(200);
    expect((await res.json()).invoice).toMatchObject({
      status: "waived",
      waivedAt: "2026-11-02T04:30:00.000Z",
      waiveReason: "Sibling scholarship",
    });
    await advance(10 * DAY);
    await app.runJobs();
    expect((await list("?status=waived")).invoices[0]).toMatchObject({ status: "waived", lateFeePaise: 0 });
  });

  it("needs a reason", async () => {
    const { call, list } = await owner();
    const [bill] = (await list()).invoices;

    const res = await call("POST", `/invoices/${bill.id}/waive`, { reason: " " });

    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ reason: "Say why the fee is waived." });
  });

  it("won't waive a bill twice", async () => {
    const { call, list } = await owner();
    const [bill] = (await list()).invoices;
    await call("POST", `/invoices/${bill.id}/waive`, { reason: "Scholarship" });

    const res = await call("POST", `/invoices/${bill.id}/waive`, { reason: "Again" });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("invoice_closed");
  });
});
