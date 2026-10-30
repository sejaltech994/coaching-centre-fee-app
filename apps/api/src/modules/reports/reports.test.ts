import { parseCsv } from "@chukta/shared";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { owner } from "../../test/owner";

describe("GET /reports/monthly", () => {
  it("gives a Pro centre the month's bills as a CSV, with how each was paid", async () => {
    const { call, list } = await owner("asha@example.com", undefined, { plan: "pro" });
    const [bill] = (await list()).invoices;
    await call("POST", `/invoices/${bill.id}/payments`, { method: "upi", reference: "412345678901" });

    const res = await call("GET", "/reports/monthly?month=2026-11");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="chukta-fees-2026-11.csv"');
    expect(parseCsv(await res.text())).toEqual([
      ["Bill", "Student", "Parent", "Batch", "Period", "Due", "Amount (₹)", "Late fee (₹)", "Status", "Paid on", "Paid by", "Reference", "Receipt"],
      ["1", "Aarav Sharma", "Neha Sharma", "Class 10 Maths", "Nov 2026", "2026-11-05", "2500.00", "0.00", "paid", "2026-11-02", "upi", "412345678901", "1"],
    ]);
  });

  it("is a Pro feature, for the owner's own centre only", async () => {
    const free = await owner();
    const res = await free.call("GET", "/reports/monthly?month=2026-11");
    expect(res.status).toBe(402);
    expect((await res.json()).error.message).toBe("Monthly reports come with Pro.");
    expect((await free.call("GET", "/reports/monthly?month=Nov")).status).toBe(400);
    expect((await (await createTestApp()).call("GET", "/reports/monthly?month=2026-11")).status).toBe(401);
  });
});
