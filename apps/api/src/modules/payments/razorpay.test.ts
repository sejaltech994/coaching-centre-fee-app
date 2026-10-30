import { createHmac } from "node:crypto";
import { paymentSettings } from "@chukta/db";
import type { FakeGateway } from "@chukta/integrations";
import { describe, expect, it } from "vitest";
import { owner } from "../../test/owner";

const KEYS = { keyId: "rzp_test_abc123", keySecret: "key-secret", webhookSecret: "webhook-secret" };

/** A Pro owner with a bill for Aarav, their Razorpay account connected (on the fake gateway). */
async function connected() {
  const o = await owner("asha@example.com", undefined, { plan: "pro" });
  const res = await o.call("PUT", "/centre/razorpay", KEYS);
  const [bill] = (await o.list()).invoices;
  const token = new URL(bill.payLink).searchParams.get("t")!;
  const centreId = (await o.json("GET", "/me")).centre.id as string;
  return { ...o, res, bill, token, centreId, fake: o.app.gateway as FakeGateway };
}

/** Razorpay's payment_link.paid event for a bill, signed as Razorpay signs it. */
function paidEvent(invoiceId: string, linkId: string, paymentId = "pay_1", secret = KEYS.webhookSecret) {
  const body = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: linkId, status: "paid", notes: { invoice_id: invoiceId } } },
      payment: { entity: { id: paymentId, method: "card", amount: 250000, status: "captured" } },
    },
  });
  return { body, signature: createHmac("sha256", secret).update(body).digest("hex") };
}

async function deliver(o: Awaited<ReturnType<typeof connected>>, event: { body: string; signature: string }, eventId = "evt_1") {
  return o.app.app.request(`/api/v1/webhooks/razorpay/${o.centreId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": event.signature, "x-razorpay-event-id": eventId },
    body: event.body,
  });
}

describe("connecting the centre's own Razorpay account", () => {
  it("checks the keys with Razorpay, keeps the secrets encrypted and gives the webhook address", async () => {
    const { res, app, json, centreId } = await connected();

    expect(res.status).toBe(200);
    const razorpay = { keyId: "rzp_test_abc123", webhookUrl: `http://localhost:3000/api/v1/webhooks/razorpay/${centreId}` };
    expect((await res.json()).razorpay).toEqual(razorpay);
    expect((await json("GET", "/centre/payment-settings")).paymentSettings.razorpay).toEqual(razorpay);
    const [row] = await app.db.select().from(paymentSettings);
    expect(row!.razorpayKeySecret).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain("key-secret");
    expect(JSON.stringify(row)).not.toContain("webhook-secret");
  });

  it("refuses keys Razorpay doesn't accept, or that don't look like keys", async () => {
    const { call } = await owner("asha@example.com", undefined, { plan: "pro" });

    const refused = await call("PUT", "/centre/razorpay", { ...KEYS, keyId: "rzp_live_unknown" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.fields).toEqual({ keySecret: "Razorpay didn’t accept these keys. Check the key ID and secret." });

    const malformed = await call("PUT", "/centre/razorpay", { keyId: "abc", keySecret: "", webhookSecret: "" });
    expect((await malformed.json()).error.fields).toEqual({
      keyId: "Enter the key ID from Razorpay, starting rzp_live_ or rzp_test_.",
      keySecret: "Enter the key secret.",
      webhookSecret: "Enter the webhook secret you set in Razorpay.",
    });
  });

  it("disconnects", async () => {
    const { call, json } = await connected();
    expect((await call("DELETE", "/centre/razorpay")).status).toBe(204);
    expect((await json("GET", "/centre/payment-settings")).paymentSettings.razorpay).toBeNull();
  });
});

describe("paying by card, UPI or net banking from the pay link", () => {
  it("makes a Razorpay link on the centre's account, and reuses it", async () => {
    const { app, token, fake, bill } = await connected();
    expect((await (await app.call("GET", `/public/invoices/${token}`)).json()).card).toBe(true);

    const first = await (await app.call("POST", `/public/invoices/${token}/checkout`)).json();
    const second = await (await app.call("POST", `/public/invoices/${token}/checkout`)).json();

    expect(first.url).toMatch(/^http:\/\/localhost:8787\/api\/v1\/dev\/fake-razorpay\/plink_fake_/);
    expect(second.url).toBe(first.url);
    const link = fake.link(first.url.split("/").pop());
    expect(link).toMatchObject({ invoiceId: bill.id, amountPaise: 250000, callbackUrl: bill.payLink, customer: { name: "Neha Sharma" } });
  });

  it("isn't offered without a connected account, or once the bill is paid", async () => {
    const plain = await owner();
    const [bill] = (await plain.list()).invoices;
    const token = new URL(bill.payLink).searchParams.get("t");
    expect((await (await plain.app.call("GET", `/public/invoices/${token}`)).json()).card).toBe(false);
    const res = await plain.app.call("POST", `/public/invoices/${token}/checkout`);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("gateway_not_connected");

    const { app, call, token: paidToken, bill: paidBill } = await connected();
    await call("POST", `/invoices/${paidBill.id}/payments`, { method: "cash" });
    expect((await app.call("POST", `/public/invoices/${paidToken}/checkout`)).status).toBe(409);
  });
});

describe("POST /webhooks/razorpay/:centreId", () => {
  it("marks the bill paid by its gateway payment, with a receipt, once however often it arrives", async () => {
    const o = await connected();
    const event = paidEvent(o.bill.id, "plink_1");

    expect((await deliver(o, event)).status).toBe(200);
    expect((await deliver(o, event)).status).toBe(200);
    expect((await deliver(o, event, "evt_2")).status).toBe(200);

    const { invoices } = await o.json("GET", "/invoices?status=paid");
    expect(invoices).toHaveLength(1);
    expect(invoices[0].payment).toMatchObject({ method: "card", reference: "pay_1", receipt: { number: 1 } });
  });

  it("refuses an event that isn't signed with the centre's webhook secret", async () => {
    const o = await connected();
    expect((await deliver(o, paidEvent(o.bill.id, "plink_1", "pay_1", "wrong"))).status).toBe(401);
    expect((await o.json("GET", "/invoices")).invoices[0].status).toBe("pending");
  });

  it("is 404 for a centre without Razorpay", async () => {
    const o = await connected();
    await o.call("DELETE", "/centre/razorpay");
    expect((await deliver(o, paidEvent(o.bill.id, "plink_1"))).status).toBe(404);
  });

  it("keeps a bill already paid in cash as it is", async () => {
    const o = await connected();
    await o.call("POST", `/invoices/${o.bill.id}/payments`, { method: "cash" });

    expect((await deliver(o, paidEvent(o.bill.id, "plink_1"))).status).toBe(200);

    expect((await o.json("GET", "/invoices?status=paid")).invoices[0].payment.method).toBe("cash");
  });
});

describe("the fake checkout (never in production)", () => {
  it("shows the amount and, on Pay, marks the bill paid and returns to the pay page", async () => {
    const { app, token, bill, json } = await connected();
    const { url } = await (await app.call("POST", `/public/invoices/${token}/checkout`)).json();
    const path = new URL(url).pathname.replace("/api/v1", "");

    const page = await app.call("GET", path);
    expect(await page.text()).toContain("₹2,500");

    const paid = await app.call("POST", `${path}/pay`);
    expect(paid.status).toBe(303);
    expect(paid.headers.get("location")).toBe(bill.payLink);
    expect((await json("GET", "/invoices?status=paid")).invoices[0].payment.method).toBe("upi");
  });
});

describe("the hourly reconcile", () => {
  it("catches a payment whose webhook never arrived", async () => {
    const { app, token, fake, json } = await connected();
    const { url } = await (await app.call("POST", `/public/invoices/${token}/checkout`)).json();
    fake.pay(url.split("/").pop());

    await app.runJobs();

    expect((await json("GET", "/invoices?status=paid")).invoices).toHaveLength(1);
  });
});
