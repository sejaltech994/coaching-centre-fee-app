import { hmacHex, sameText } from "../hmac";

/**
 * Razorpay, on each centre's OWN account (TSD: Payments): Chukta calls it with the
 * centre's keys, so money settles to the centre and never passes through Chukta.
 * Payment Links API: https://razorpay.com/docs/api/payments/payment-links/
 */

export type GatewayKeys = { keyId: string; keySecret: string };

export type NewPaymentLink = {
  amountPaise: number;
  description: string;
  /** Unique per link on the account; at most 40 characters. */
  referenceId: string;
  invoiceId: string;
  customer: { name: string; contact?: string };
  /** Where Razorpay sends the parent after paying: their pay page. */
  callbackUrl: string;
  expireBy?: Date;
};

export type GatewayPayment = { id: string; method: string };
export type PaymentLinkState = { status: string; payment: GatewayPayment | null };

export interface PaymentGateway {
  /** True when Razorpay accepts the keys. */
  verifyCredentials(keys: GatewayKeys): Promise<boolean>;
  createPaymentLink(keys: GatewayKeys, link: NewPaymentLink): Promise<{ id: string; shortUrl: string }>;
  fetchPaymentLink(keys: GatewayKeys, id: string): Promise<PaymentLinkState>;
}

const API = "https://api.razorpay.com/v1";

export function createRazorpayGateway(options: { fetch?: typeof fetch } = {}): PaymentGateway {
  const fetchFn = options.fetch ?? fetch;

  async function request(keys: GatewayKeys, method: string, path: string, body?: unknown) {
    const res = await fetchFn(`${API}${path}`, {
      method,
      headers: {
        authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, ok: res.ok, payload };
  }

  async function expectOk(keys: GatewayKeys, method: string, path: string, body?: unknown) {
    const res = await request(keys, method, path, body);
    if (!res.ok) {
      const error = (res.payload?.error as { description?: string } | undefined)?.description ?? "request failed";
      throw new Error(`Razorpay ${res.status}: ${error}`);
    }
    return res.payload!;
  }

  return {
    async verifyCredentials(keys) {
      const res = await request(keys, "GET", "/payments?count=1");
      if (res.status === 401) return false;
      if (!res.ok) throw new Error(`Razorpay ${res.status}`);
      return true;
    },

    async createPaymentLink(keys, link) {
      const created = await expectOk(keys, "POST", "/payment_links", {
        amount: link.amountPaise,
        currency: "INR",
        accept_partial: false,
        description: link.description,
        reference_id: link.referenceId,
        customer: link.customer,
        // Chukta sends its own WhatsApp reminders; Razorpay's would duplicate them.
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { invoice_id: link.invoiceId },
        callback_url: link.callbackUrl,
        callback_method: "get",
        ...(link.expireBy && { expire_by: Math.floor(link.expireBy.getTime() / 1000) }),
      });
      return { id: String(created.id), shortUrl: String(created.short_url) };
    },

    async fetchPaymentLink(keys, id) {
      const link = await expectOk(keys, "GET", `/payment_links/${encodeURIComponent(id)}`);
      const payments = (link.payments as { payment_id: string; method: string; status: string }[] | null) ?? [];
      const captured = payments.find((p) => p.status === "captured");
      return { status: String(link.status), payment: captured ? { id: captured.payment_id, method: captured.method } : null };
    },
  };
}

/** Razorpay signs each webhook's raw body with the webhook secret (HMAC-SHA256, hex). Compared in constant time. */
export async function verifyRazorpaySignature(body: string, signature: string, secret: string): Promise<boolean> {
  return sameText(await hmacHex(secret, body), signature);
}

type FakeLink = NewPaymentLink & { status: "created" | "paid"; payment: GatewayPayment | null };

/**
 * A stand-in for Razorpay outside production (RAZORPAY_PROVIDER=fake): test keys
 * (rzp_test_…) are accepted, links point at the API's own fake checkout, and
 * pay() marks one paid. Kept in memory, so only for local runs and tests.
 */
export function createFakeGateway(checkoutBase: string) {
  const links = new Map<string, FakeLink>();
  const random = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);
  return {
    async verifyCredentials(keys: GatewayKeys) {
      return keys.keyId.startsWith("rzp_test_");
    },
    async createPaymentLink(_keys: GatewayKeys, link: NewPaymentLink) {
      const id = `plink_fake_${random()}`;
      links.set(id, { ...link, status: "created", payment: null });
      return { id, shortUrl: `${checkoutBase}/${id}` };
    },
    async fetchPaymentLink(_keys: GatewayKeys, id: string): Promise<PaymentLinkState> {
      const link = links.get(id);
      return { status: link?.status ?? "cancelled", payment: link?.payment ?? null };
    },
    link(id: string) {
      return links.get(id) ?? null;
    },
    /** The parent pays on the fake checkout. */
    pay(id: string): GatewayPayment {
      const link = links.get(id);
      if (!link) throw new Error(`No fake payment link ${id}`);
      link.status = "paid";
      link.payment = { id: `pay_fake_${random()}`, method: "upi" };
      return link.payment;
    },
  } satisfies PaymentGateway & Record<string, unknown>;
}

export type FakeGateway = ReturnType<typeof createFakeGateway>;
