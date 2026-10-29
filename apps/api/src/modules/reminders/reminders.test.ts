import { createHmac } from "node:crypto";
import { centres, invoices, reminders } from "@chukta/db";
import type { FakeWhatsApp } from "@chukta/integrations";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { DAY, owner } from "../../test/owner";

const HOUR = 60 * 60 * 1000;

/** Aarav's parent has agreed to WhatsApp; the clock is 10:00 in India on 2 Nov, 3 days before the 5 Nov due date. */
async function optedIn(config?: Parameters<typeof createTestApp>[0]) {
  const o = await owner("asha@example.com", config ? await createTestApp(config) : undefined);
  await o.call("PATCH", `/students/${o.studentId}`, { whatsappOptIn: true });
  const [bill] = (await o.list()).invoices;
  return { ...o, bill, whatsapp: o.app.messaging as FakeWhatsApp };
}

describe("scheduled reminders", () => {
  it("sends the fee-due reminder 3 days before, once, with the bill's pay link", async () => {
    const { app, json, whatsapp, bill } = await optedIn();

    await app.runJobs();
    await app.runJobs();

    expect(whatsapp.sent).toEqual([
      {
        to: "+919876543210",
        templateName: "chukta_fee_due_gentle_v1",
        variables: ["Neha Sharma", "Sunrise Classes", "Aarav Sharma", "₹2,500", "Nov 2026", "5 Nov 2026", bill.payLink],
        messageId: expect.any(String),
      },
    ]);
    const { reminders: sent } = await json("GET", "/reminders");
    expect(sent).toEqual([
      {
        id: expect.any(String),
        kind: "pre_due",
        status: "sent",
        template: "chukta_fee_due_gentle_v1",
        error: null,
        invoice: { id: bill.id, number: 1 },
        student: { id: bill.student.id, name: "Aarav Sharma" },
        sentAt: "2026-11-02T04:30:00.000Z",
        createdAt: "2026-11-02T04:30:00.000Z",
      },
    ]);
  });

  it("waits for daytime in India: nothing between 20:00 and 9:00", async () => {
    const { app, advance, whatsapp } = await optedIn();
    await advance(11 * HOUR); // 21:00 in India
    await app.runJobs();
    expect(whatsapp.sent).toEqual([]);
  });

  it("sends the overdue reminder 3 days after, in the centre's chosen tone", async () => {
    const { app, call, advance, whatsapp } = await optedIn();
    await app.runJobs(); // pre_due on 2 Nov
    expect((await call("PUT", "/centre/reminder-tone", { tone: "firm" })).status).toBe(200);

    await advance(6 * DAY); // 8 Nov: 3 days overdue
    await app.runJobs();

    expect(whatsapp.sent.map((m) => m.templateName)).toEqual(["chukta_fee_due_gentle_v1", "chukta_fee_overdue_firm_v1"]);
  });

  it("records a reminder as skipped when the parent hasn't agreed to WhatsApp", async () => {
    const { app, json, whatsapp } = await owner().then(async (o) => ({ ...o, whatsapp: o.app.messaging as FakeWhatsApp }));

    await app.runJobs();

    expect(whatsapp.sent).toEqual([]);
    expect((await json("GET", "/reminders")).reminders[0]).toMatchObject({
      kind: "pre_due",
      status: "skipped",
      error: "The parent hasn’t agreed to WhatsApp messages.",
    });
  });

  it("never reminds about a paid bill, and thanks the parent with the receipt link instead", async () => {
    const { app, call, whatsapp, bill } = await optedIn();
    await call("POST", `/invoices/${bill.id}/payments`, { method: "cash" });

    await app.runJobs();

    expect(whatsapp.sent.map((m) => [m.templateName, m.variables.at(-1)])).toEqual([["chukta_payment_received_v1", bill.payLink]]);
  });
});

describe("POST /reminders/send", () => {
  it("reminds about chosen bills now, as often as the owner likes", async () => {
    const { call, json, whatsapp, bill } = await optedIn();

    const first = await json("POST", "/reminders/send", { invoiceIds: [bill.id] });
    await call("POST", "/reminders/send", { invoiceIds: [bill.id] });

    expect(first).toEqual({ results: [{ invoiceId: bill.id, status: "sent", error: null }] });
    expect(whatsapp.sent).toHaveLength(2);
    expect((await json("GET", "/reminders")).reminders.map((r: { kind: string }) => r.kind)).toEqual(["manual", "manual"]);
  });

  it("skips bills that aren't the centre's, or aren't unpaid", async () => {
    const { call, json, bill, app } = await optedIn();
    await call("POST", `/invoices/${bill.id}/waive`, { reason: "Scholarship" });
    const ravi = await owner("ravi@example.com", app);
    const [ravis] = (await ravi.list()).invoices;

    const { results } = await json("POST", "/reminders/send", { invoiceIds: [bill.id, ravis.id] });

    expect(results).toEqual([
      { invoiceId: bill.id, status: "skipped", error: "This bill is already paid or waived." },
      { invoiceId: ravis.id, status: "skipped", error: "No such bill." },
    ]);
  });

  it("says so when WhatsApp isn't set up", async () => {
    const { json, bill } = await optedIn({ whatsapp: null });
    const { results } = await json("POST", "/reminders/send", { invoiceIds: [bill.id] });
    expect(results).toEqual([{ invoiceId: bill.id, status: "skipped", error: "WhatsApp isn’t set up yet." }]);
  });

  it.each([{ invoiceIds: [] }, { invoiceIds: ["nope"] }, {}])("refuses %o", async (body) => {
    const { call } = await optedIn();
    expect((await call("POST", "/reminders/send", body)).status).toBe(400);
  });
});

describe("GET /reminders/preview", () => {
  it("shows the exact message the parent would get", async () => {
    const { json, bill } = await optedIn();
    expect(await json("GET", `/reminders/preview?invoiceId=${bill.id}`)).toEqual({
      text: `Hello Neha Sharma, a gentle reminder from Sunrise Classes: Aarav Sharma's fee of ₹2,500 for Nov 2026 is due on 5 Nov 2026. You can pay here: ${bill.payLink}`,
      canSend: true,
      reason: null,
    });
  });

  it("says why it can't be sent", async () => {
    const o = await owner();
    const [bill] = (await o.list()).invoices;
    expect(await o.json("GET", `/reminders/preview?invoiceId=${bill.id}`)).toMatchObject({
      canSend: false,
      reason: "The parent hasn’t agreed to WhatsApp messages.",
    });
  });
});

describe("reminder tone", () => {
  it("is gentle until changed, and only gentle or firm", async () => {
    const { json, call } = await owner();
    expect(await json("GET", "/centre/reminder-tone")).toEqual({ tone: "gentle" });
    expect((await call("PUT", "/centre/reminder-tone", { tone: "rude" })).status).toBe(400);
  });
});

describe("Meta's WhatsApp webhook", () => {
  const META = { provider: "meta" as const, token: "t", phoneNumberId: "1", appSecret: "app-secret", verifyToken: "verify-me" };

  async function withReminder() {
    const o = await owner("asha@example.com", await createTestApp({ whatsapp: META }));
    const [bill] = (await o.list()).invoices;
    await o.app.db.insert(reminders).values({
      centreId: (await o.app.db.select().from(centres))[0]!.id,
      invoiceId: bill.id,
      kind: "manual",
      template: "chukta_fee_due_gentle_v1",
      templateVersion: 1,
      status: "sent",
      providerMessageId: "wamid.1",
    });
    const post = (payload: unknown, secret = "app-secret") => {
      const body = JSON.stringify(payload);
      return o.app.app.request("/api/v1/webhooks/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
        body,
      });
    };
    return { ...o, bill, post };
  }

  const change = (value: unknown) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value }] }] });

  it("answers Meta's subscription check with the verify token", async () => {
    const { app } = await withReminder();
    const ok = await app.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345");
    expect([ok.status, await ok.text()]).toEqual([200, "12345"]);
    expect((await app.call("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status).toBe(403);
  });

  it("updates a reminder as Meta delivers it, never going backwards", async () => {
    const { post, json } = await withReminder();
    for (const status of ["delivered", "read", "delivered"]) {
      expect((await post(change({ statuses: [{ id: "wamid.1", status }] }))).status).toBe(200);
    }
    expect((await json("GET", "/reminders")).reminders[0].status).toBe("read");
  });

  it("records why a message failed", async () => {
    const { post, json } = await withReminder();
    await post(change({ statuses: [{ id: "wamid.1", status: "failed", errors: [{ title: "Message undeliverable" }] }] }));
    expect((await json("GET", "/reminders")).reminders[0]).toMatchObject({ status: "failed", error: "Message undeliverable" });
  });

  it("stops messages to a parent who replies STOP", async () => {
    const { post, call, studentId, json } = await withReminder();
    await call("PATCH", `/students/${studentId}`, { whatsappOptIn: true });

    await post(change({ messages: [{ id: "wamid.in1", from: "919876543210", type: "text", text: { body: " stop " } }] }));

    expect((await json("GET", `/students/${studentId}`)).student.whatsappOptIn).toBe(false);
  });

  it("refuses an event Meta didn't sign", async () => {
    const { post, app } = await withReminder();
    expect((await post(change({ statuses: [] }), "wrong")).status).toBe(401);
    expect(await app.db.select().from(invoices)).toHaveLength(1);
  });
});

describe("GET /reminders", () => {
  it("needs an access token", async () => {
    const app = await createTestApp();
    expect((await app.call("GET", "/reminders")).status).toBe(401);
  });
});
