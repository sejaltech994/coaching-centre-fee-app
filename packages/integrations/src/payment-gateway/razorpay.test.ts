import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeGateway, createRazorpayGateway, verifyRazorpaySignature } from "./razorpay";

const fetchMock = vi.fn<typeof fetch>();
const keys = { keyId: "rzp_test_abc", keySecret: "secret" };
const gateway = createRazorpayGateway({ fetch: fetchMock });

const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
const sent = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i]!;
  return { url, method: init!.method, headers: new Headers(init!.headers), body: init!.body && JSON.parse(init!.body as string) };
};

beforeEach(() => fetchMock.mockReset());

describe("createRazorpayGateway", () => {
  it("checks the centre's keys against Razorpay with basic auth", async () => {
    reply(200, { items: [] });
    reply(401, { error: { code: "BAD_REQUEST_ERROR" } });

    await expect(gateway.verifyCredentials(keys)).resolves.toBe(true);
    await expect(gateway.verifyCredentials(keys)).resolves.toBe(false);
    expect(sent().url).toBe("https://api.razorpay.com/v1/payments?count=1");
    expect(sent().headers.get("authorization")).toBe(`Basic ${Buffer.from("rzp_test_abc:secret").toString("base64")}`);
  });

  it("creates a UPI-first payment link for the exact amount, with the bill in its reference and notes", async () => {
    reply(200, { id: "plink_1", short_url: "https://rzp.io/i/abc", status: "created" });

    const link = await gateway.createPaymentLink(keys, {
      amountPaise: 250000,
      description: "Bill #1 · Aarav Sharma · Nov 2026",
      referenceId: "inv-1",
      invoiceId: "i1",
      customer: { name: "Neha Sharma", contact: "+919876543210" },
      callbackUrl: "https://app.example/pay/?t=abc",
      expireBy: new Date("2026-12-02T00:00:00Z"),
    });

    expect(link).toEqual({ id: "plink_1", shortUrl: "https://rzp.io/i/abc" });
    expect(sent()).toMatchObject({ url: "https://api.razorpay.com/v1/payment_links", method: "POST" });
    expect(sent().body).toEqual({
      amount: 250000,
      currency: "INR",
      accept_partial: false,
      description: "Bill #1 · Aarav Sharma · Nov 2026",
      reference_id: "inv-1",
      customer: { name: "Neha Sharma", contact: "+919876543210" },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { invoice_id: "i1" },
      callback_url: "https://app.example/pay/?t=abc",
      callback_method: "get",
      expire_by: 1796169600,
    });
  });

  it("reads a link's status and the payment that paid it", async () => {
    reply(200, { id: "plink_1", status: "paid", payments: [{ payment_id: "pay_1", method: "card", status: "captured", amount: 250000 }] });
    reply(200, { id: "plink_2", status: "created", payments: null });

    await expect(gateway.fetchPaymentLink(keys, "plink_1")).resolves.toEqual({ status: "paid", payment: { id: "pay_1", method: "card" } });
    await expect(gateway.fetchPaymentLink(keys, "plink_2")).resolves.toEqual({ status: "created", payment: null });
    expect(sent(0).url).toBe("https://api.razorpay.com/v1/payment_links/plink_1");
  });

  it("throws on any other failure, naming Razorpay's error", async () => {
    reply(400, { error: { description: "The amount must be at least INR 1.00" } });
    await expect(
      gateway.createPaymentLink(keys, { amountPaise: 1, description: "x", referenceId: "r", invoiceId: "i", customer: { name: "x" }, callbackUrl: "u" }),
    ).rejects.toThrow("Razorpay 400: The amount must be at least INR 1.00");
  });
});

describe("verifyRazorpaySignature", () => {
  const body = '{"event":"payment_link.paid"}';
  const signature = createHmac("sha256", "whsec").update(body).digest("hex");

  it("accepts Razorpay's HMAC-SHA256 of the raw body, and nothing else", async () => {
    await expect(verifyRazorpaySignature(body, signature, "whsec")).resolves.toBe(true);
    await expect(verifyRazorpaySignature(`${body} `, signature, "whsec")).resolves.toBe(false);
    await expect(verifyRazorpaySignature(body, signature, "other")).resolves.toBe(false);
    await expect(verifyRazorpaySignature(body, "", "whsec")).resolves.toBe(false);
  });
});

describe("createFakeGateway (never in production)", () => {
  it("accepts test keys, makes links on a fake checkout and reports them paid once paid", async () => {
    const fake = createFakeGateway("http://localhost:8787/api/v1/dev/fake-razorpay");

    await expect(fake.verifyCredentials({ keyId: "rzp_test_x", keySecret: "s" })).resolves.toBe(true);
    await expect(fake.verifyCredentials({ keyId: "nope", keySecret: "s" })).resolves.toBe(false);
    const link = await fake.createPaymentLink(keys, {
      amountPaise: 250000,
      description: "Bill #1",
      referenceId: "r",
      invoiceId: "i1",
      customer: { name: "Neha" },
      callbackUrl: "http://localhost:3000/pay/?t=abc",
    });
    expect(link.shortUrl).toBe(`http://localhost:8787/api/v1/dev/fake-razorpay/${link.id}`);
    expect(fake.link(link.id)).toMatchObject({ invoiceId: "i1", amountPaise: 250000, callbackUrl: "http://localhost:3000/pay/?t=abc" });
    await expect(fake.fetchPaymentLink(keys, link.id)).resolves.toEqual({ status: "created", payment: null });

    const payment = fake.pay(link.id);

    expect(payment).toEqual({ id: expect.stringMatching(/^pay_fake_/), method: "upi" });
    await expect(fake.fetchPaymentLink(keys, link.id)).resolves.toEqual({ status: "paid", payment });
  });
});

describe("Razorpay subscriptions (Chukta's own Pro plan)", () => {
  it("starts a monthly subscription on a plan, for the centre, with Razorpay's checkout link", async () => {
    reply(200, { id: "sub_1", short_url: "https://rzp.io/i/sub", status: "created" });

    await expect(gateway.createSubscription(keys, { planId: "plan_pro", notes: { centre_id: "c1" } })).resolves.toEqual({
      id: "sub_1",
      shortUrl: "https://rzp.io/i/sub",
    });
    expect(sent()).toMatchObject({ url: "https://api.razorpay.com/v1/subscriptions", method: "POST" });
    expect(sent().body).toEqual({ plan_id: "plan_pro", total_count: 120, quantity: 1, customer_notify: 1, notes: { centre_id: "c1" } });
  });

  it("cancels at the end of the paid period", async () => {
    reply(200, { id: "sub_1", status: "active" });
    await gateway.cancelSubscription(keys, "sub_1");
    expect(sent()).toMatchObject({ url: "https://api.razorpay.com/v1/subscriptions/sub_1/cancel", method: "POST", body: { cancel_at_cycle_end: 1 } });
  });
});

describe("the fake gateway's subscriptions", () => {
  it("makes a checkout link, and on payment gives the paid period's end", async () => {
    const fake = createFakeGateway("http://localhost:8787/api/v1/dev/fake-razorpay");
    const sub = await fake.createSubscription(keys, { planId: "plan_pro", notes: { centre_id: "c1" } });

    expect(sub.shortUrl).toBe(`http://localhost:8787/api/v1/dev/fake-razorpay/subscriptions/${sub.id}`);
    expect(fake.subscription(sub.id)).toMatchObject({ notes: { centre_id: "c1" }, status: "created" });
    const paid = fake.paySubscription(sub.id, new Date("2026-11-02T04:30:00Z"));
    expect(paid).toEqual({ status: "active", currentEnd: new Date("2026-12-02T04:30:00Z") });
    await fake.cancelSubscription(keys, sub.id);
    expect(fake.subscription(sub.id)!.status).toBe("cancelled");
  });
});
