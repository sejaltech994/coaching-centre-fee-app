import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { AARAV, DAY, owner } from "../../test/owner";

/**
 * 24 Nov: Aarav and Diya each have November's bill (₹2,500 + ₹100 late fee,
 * overdue) and December's (₹2,500, pending). Aarav's November is paid in cash.
 */
async function midMonth() {
  const o = await owner();
  const diya = (await o.json("POST", "/students", { ...AARAV, name: "Diya Rao", parentName: "Ravi Rao", batchIds: [o.batch] })).student;
  await o.advance(22 * DAY);
  await o.app.runJobs();
  const aaravsNovember = (await o.json("GET", `/invoices?studentId=${o.studentId}&month=2026-11`)).invoices[0];
  await o.call("POST", `/invoices/${aaravsNovember.id}/payments`, { method: "cash" });
  return { ...o, diyaId: diya.id as string };
}

describe("GET /dashboard/summary", () => {
  it("shows a month's money: collected, billed and still owed, overdue bills, and who owes", async () => {
    const { json, diyaId } = await midMonth();

    const summary = await json("GET", "/dashboard/summary?month=2026-11");

    expect(summary).toEqual({
      month: "2026-11",
      collectedPaise: 260000,
      billedPaise: 520000,
      outstandingPaise: 260000,
      overduePaise: 260000,
      defaulters: [
        {
          student: { id: diyaId, name: "Diya Rao", parentName: "Ravi Rao" },
          overduePaise: 260000,
          bills: 1,
          oldestDueDate: "2026-11-05",
          invoiceIds: [expect.any(String)],
        },
      ],
    });
  });

  it("shows this month by default, with next month's bills not yet overdue", async () => {
    const { json } = await midMonth();
    const summary = await json("GET", "/dashboard/summary");
    expect(summary).toMatchObject({ month: "2026-11", collectedPaise: 260000, overduePaise: 260000 });
    expect(await json("GET", "/dashboard/summary?month=2026-12")).toMatchObject({
      month: "2026-12",
      collectedPaise: 0,
      billedPaise: 500000,
      outstandingPaise: 500000,
      overduePaise: 260000,
    });
  });

  it("leaves waived bills out of what's billed and owed", async () => {
    const { json, call, diyaId } = await midMonth();
    const diyas = (await json("GET", `/invoices?studentId=${diyaId}&month=2026-11`)).invoices[0];
    await call("POST", `/invoices/${diyas.id}/waive`, { reason: "Scholarship" });

    expect(await json("GET", "/dashboard/summary?month=2026-11")).toMatchObject({
      billedPaise: 260000,
      outstandingPaise: 0,
      overduePaise: 0,
      defaulters: [],
    });
  });

  it("counts only the owner's own centre", async () => {
    const asha = await midMonth();
    const ravi = await owner("ravi@example.com", asha.app);
    expect(await ravi.json("GET", "/dashboard/summary?month=2026-11")).toMatchObject({ collectedPaise: 0, overduePaise: 0, defaulters: [] });
  });

  it("refuses a month that isn't YYYY-MM, and needs an access token", async () => {
    const { call } = await owner();
    expect((await call("GET", "/dashboard/summary?month=November")).status).toBe(400);
    expect((await (await createTestApp()).call("GET", "/dashboard/summary")).status).toBe(401);
  });
});
