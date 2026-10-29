import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { DAY, owner } from "../../test/owner";

const UPI = { upiId: "sunrise@okicici", payeeName: "Sunrise Classes" };

async function billed() {
  const o = await owner();
  const [bill] = (await o.list()).invoices;
  return { ...o, bill };
}

describe("GET and PUT /centre/payment-settings", () => {
  it("starts with no UPI ID, and saves the centre's own", async () => {
    const { json } = await owner();
    expect(await json("GET", "/centre/payment-settings")).toEqual({ paymentSettings: { upiId: null, payeeName: null } });

    expect(await json("PUT", "/centre/payment-settings", { upiId: " Sunrise@OKICICI ", payeeName: "Sunrise Classes" })).toEqual({
      paymentSettings: UPI,
    });
    expect(await json("GET", "/centre/payment-settings")).toEqual({ paymentSettings: UPI });

    expect(await json("PUT", "/centre/payment-settings", { upiId: "", payeeName: "" })).toEqual({
      paymentSettings: { upiId: null, payeeName: null },
    });
  });

  it("names the field at fault", async () => {
    const { call } = await owner();
    const res = await call("PUT", "/centre/payment-settings", { upiId: "9876543210", payeeName: "Sunrise" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ upiId: "Enter a UPI ID like name@bank." });
  });
});

describe("POST /invoices/:id/payments", () => {
  it("records a payment in full, marks the bill paid and issues receipt 1", async () => {
    const { call, bill } = await billed();

    const res = await call("POST", `/invoices/${bill.id}/payments`, { method: "upi", reference: " 412345678901 " });

    expect(res.status).toBe(201);
    expect((await res.json()).invoice).toMatchObject({
      status: "paid",
      paidAt: "2026-11-02T04:30:00.000Z",
      payment: {
        method: "upi",
        amountPaise: 250000,
        reference: "412345678901",
        receivedAt: "2026-11-02T04:30:00.000Z",
        receipt: { id: expect.any(String), number: 1 },
      },
    });
  });

  it("takes an earlier day it was received, but not a future one", async () => {
    const { call, bill } = await billed();

    const future = await call("POST", `/invoices/${bill.id}/payments`, { method: "cash", receivedOn: "2026-11-03" });
    expect(future.status).toBe(400);
    expect((await future.json()).error.fields).toEqual({ receivedOn: "The payment can’t be received in the future." });

    const res = await call("POST", `/invoices/${bill.id}/payments`, { method: "cash", receivedOn: "2026-11-01" });
    expect((await res.json()).invoice.payment.receivedAt).toBe("2026-11-01T06:30:00.000Z");
  });

  it("charges the late fee too, once it's added, and numbers receipts in order", async () => {
    const { app, json, advance } = await owner();
    await advance(22 * DAY); // 24 Nov: November is overdue with its late fee; December is billed
    await app.runJobs();
    const [december, november] = (await json("GET", "/invoices")).invoices;

    const first = (await json("POST", `/invoices/${november.id}/payments`, { method: "cash" })).invoice;
    const second = (await json("POST", `/invoices/${december.id}/payments`, { method: "bank_transfer" })).invoice;

    expect([first.payment.amountPaise, first.payment.receipt.number]).toEqual([260000, 1]);
    expect([second.payment.amountPaise, second.payment.receipt.number]).toEqual([250000, 2]);
    await app.runJobs();
    expect((await json("GET", "/invoices?status=paid")).invoices).toHaveLength(2);
  });

  it("won't take a payment for a bill that's paid or waived", async () => {
    const { call, json, bill } = await billed();
    await call("POST", `/invoices/${bill.id}/payments`, { method: "cash" });
    const again = await call("POST", `/invoices/${bill.id}/payments`, { method: "cash" });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("invoice_closed");

    const { student } = await json("POST", "/students", {
      name: "Diya",
      parentName: "Ravi",
      parentPhone: "9123456789",
      batchIds: [(await json("GET", "/batches")).batches[0].id],
    });
    const diyas = (await json("GET", `/invoices?studentId=${student.id}`)).invoices[0];
    await call("POST", `/invoices/${diyas.id}/waive`, { reason: "Scholarship" });
    expect((await call("POST", `/invoices/${diyas.id}/payments`, { method: "cash" })).status).toBe(409);
  });

  it.each([{ method: "cheque" }, { method: "card" }, { method: "cash", receivedOn: "yesterday" }, { method: "cash", reference: "x".repeat(101) }])(
    "refuses %o",
    async (body) => {
      const { call, bill } = await billed();
      expect((await call("POST", `/invoices/${bill.id}/payments`, body)).status).toBe(400);
    },
  );

  it("only touches the owner's own bills", async () => {
    const asha = await billed();
    const ravi = await owner("ravi@example.com", asha.app);
    expect((await ravi.call("POST", `/invoices/${asha.bill.id}/payments`, { method: "cash" })).status).toBe(404);
  });
});

describe("receipts", () => {
  async function paid() {
    const o = await billed();
    await o.call("PUT", "/centre/payment-settings", UPI);
    const { invoice } = await o.json("POST", `/invoices/${o.bill.id}/payments`, { method: "upi", reference: "412345678901" });
    return { ...o, invoice };
  }

  it("downloads the receipt as a PDF for the owner", async () => {
    const { call, invoice } = await paid();

    const res = await call("GET", `/receipts/${invoice.payment.receipt.id}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="receipt-1.pdf"');
    const pdf = await PDFDocument.load(await res.arrayBuffer());
    expect(pdf.getTitle()).toBe("Receipt 1 · Sunrise Classes");
    expect(pdf.getPageCount()).toBe(1);
  });

  it("keeps each centre's receipts to itself", async () => {
    const asha = await paid();
    const ravi = await owner("ravi@example.com", asha.app);
    expect((await ravi.call("GET", `/receipts/${asha.invoice.payment.receipt.id}/pdf`)).status).toBe(404);
    expect((await ravi.call("GET", "/receipts/nope/pdf")).status).toBe(404);
  });
});

describe("the parent's pay link", () => {
  it("is on every bill", async () => {
    const { bill } = await billed();
    expect(bill.payLink).toMatch(/^http:\/\/localhost:3000\/pay\/\?t=[0-9a-f]{32}$/);
  });

  it("shows the bill, without signing in, with a UPI link to the centre's own account", async () => {
    const { app, call, bill } = await billed();
    await call("PUT", "/centre/payment-settings", UPI);
    const token = new URL(bill.payLink).searchParams.get("t");

    const res = await app.call("GET", `/public/invoices/${token}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      centre: { name: "Sunrise Classes" },
      invoice: {
        number: 1,
        studentName: "Aarav Sharma",
        batchName: "Class 10 Maths",
        cycle: "monthly",
        periodStart: "2026-11-01",
        dueDate: "2026-11-05",
        totalPaise: 250000,
        lateFeePaise: 0,
        status: "pending",
      },
      upi: {
        payeeName: "Sunrise Classes",
        upiId: "sunrise@okicici",
        link: "upi://pay?pa=sunrise%40okicici&pn=Sunrise%20Classes&am=2500.00&cu=INR&tn=Bill%20%231%20Aarav%20Sharma",
      },
      receiptUrl: null,
    });
  });

  it("offers no UPI link before the centre adds its UPI ID, and the receipt once paid", async () => {
    const { app, call, bill } = await billed();
    const token = new URL(bill.payLink).searchParams.get("t");
    expect((await (await app.call("GET", `/public/invoices/${token}`)).json()).upi).toBeNull();
    expect((await app.call("GET", `/public/receipts/${token}`)).status).toBe(404);

    await call("POST", `/invoices/${bill.id}/payments`, { method: "cash" });

    const shown = await (await app.call("GET", `/public/invoices/${token}`)).json();
    expect(shown).toMatchObject({ invoice: { status: "paid" }, upi: null, receiptUrl: `/api/v1/public/receipts/${token}` });
    const receipt = await app.call("GET", `/public/receipts/${token}`);
    expect(receipt.headers.get("content-type")).toBe("application/pdf");
  });

  it("is 404 for a token that isn't a bill's", async () => {
    const { app } = await billed();
    for (const token of ["nope", "0".repeat(32)]) {
      expect((await app.call("GET", `/public/invoices/${token}`)).status).toBe(404);
    }
  });
});
