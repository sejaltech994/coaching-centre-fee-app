import { createHmac } from "node:crypto";
import { centres } from "@chukta/db";
import type { FakeGateway } from "@chukta/integrations";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { AARAV, DAY, owner } from "../../test/owner";

const WEBHOOK_SECRET = "fake-webhook-secret";

function event(name: string, subscriptionId: string, centreId: string, currentEnd = 1796169600) {
  const body = JSON.stringify({
    event: name,
    payload: { subscription: { entity: { id: subscriptionId, status: name.split(".")[1], current_end: currentEnd, notes: { centre_id: centreId } } } },
  });
  return { body, signature: createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex") };
}

async function freeCentre() {
  const o = await owner();
  const centreId = (await o.json("GET", "/me")).centre.id as string;
  const deliver = (e: { body: string; signature: string }, id = "evt_1") =>
    o.app.app.request("/api/v1/webhooks/chukta-razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": e.signature, "x-razorpay-event-id": id },
      body: e.body,
    });
  return { ...o, centreId, deliver, fake: o.app.gateway as FakeGateway };
}

describe("GET /subscription", () => {
  it("shows Free, its student limit and how many are used, and Pro's price", async () => {
    const { json } = await freeCentre();
    expect(await json("GET", "/subscription")).toEqual({
      plan: "free",
      status: null,
      renewsAt: null,
      proPricePaise: 49900,
      canUpgrade: true,
      students: { active: 1, max: 25 },
    });
  });

  it("says upgrading isn't offered where Chukta's Razorpay isn't set up", async () => {
    const o = await owner("asha@example.com", await createTestApp({ proPlan: null }));
    expect((await o.json("GET", "/subscription")).canUpgrade).toBe(false);
    const res = await o.call("POST", "/subscription");
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("upgrade_unavailable");
  });
});

describe("going Pro", () => {
  it("starts a subscription on Chukta's account and sends the owner to pay", async () => {
    const { json, fake, centreId } = await freeCentre();

    const { url } = await json("POST", "/subscription");

    expect(url).toMatch(/^http:\/\/localhost:8787\/api\/v1\/dev\/fake-razorpay\/subscriptions\/sub_fake_/);
    expect(fake.subscription(url.split("/").pop())).toMatchObject({ planId: "plan_fake_pro", notes: { centre_id: centreId } });
    expect((await json("GET", "/subscription")).status).toBe("created");
  });

  it("is Pro once Razorpay says the subscription is active, renewing at the period's end", async () => {
    const { json, deliver, centreId } = await freeCentre();
    const { url } = await json("POST", "/subscription");

    expect((await deliver(event("subscription.activated", url.split("/").pop(), centreId))).status).toBe(200);

    expect(await json("GET", "/subscription")).toMatchObject({
      plan: "pro",
      status: "active",
      renewsAt: "2026-12-02T00:00:00.000Z",
      students: { active: 1, max: null },
    });
  });

  it("goes Pro on the fake checkout too, then back to Settings", async () => {
    const { app, json } = await freeCentre();
    const { url } = await json("POST", "/subscription");
    const path = new URL(url).pathname.replace("/api/v1", "");

    expect(await (await app.call("GET", path)).text()).toContain("₹499");
    const paid = await app.call("POST", `${path}/pay`);

    expect(paid.headers.get("location")).toBe("http://localhost:3000/settings/");
    expect((await json("GET", "/subscription")).plan).toBe("pro");
  });

  it("refuses webhooks without Chukta's signature", async () => {
    const { deliver, centreId } = await freeCentre();
    const forged = { ...event("subscription.activated", "sub_x", centreId), signature: "0".repeat(64) };
    expect((await deliver(forged)).status).toBe(401);
  });

  it("won't start a second subscription while one is active", async () => {
    const { json, call, deliver, centreId } = await freeCentre();
    const { url } = await json("POST", "/subscription");
    await deliver(event("subscription.activated", url.split("/").pop(), centreId));
    const again = await call("POST", "/subscription");
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("already_pro");
  });
});

describe("cancelling Pro", () => {
  it("keeps Pro until the paid period ends, then goes back to Free", async () => {
    const { json, call, deliver, centreId, advance, app } = await freeCentre();
    const { url } = await json("POST", "/subscription");
    await deliver(event("subscription.activated", url.split("/").pop(), centreId, Math.floor(Date.parse("2026-11-20T00:00:00Z") / 1000)));

    expect((await call("POST", "/subscription/cancel")).status).toBe(200);
    expect(await json("GET", "/subscription")).toMatchObject({ plan: "pro", status: "cancelled" });

    await advance(19 * DAY); // 21 Nov, past the paid period
    await app.runJobs();
    expect(await json("GET", "/subscription")).toMatchObject({ plan: "free", status: "cancelled" });
  });

  it("goes back to Free when Razorpay gives up on a failed renewal", async () => {
    const { json, deliver, centreId, app, advance } = await freeCentre();
    const { url } = await json("POST", "/subscription");
    const id = url.split("/").pop();
    const paidUntil = Math.floor(Date.parse("2026-11-03T00:00:00Z") / 1000);
    await deliver(event("subscription.activated", id, centreId, paidUntil));
    await deliver(event("subscription.halted", id, centreId, paidUntil), "evt_2");
    await advance(2 * DAY);
    await app.runJobs();
    expect(await json("GET", "/subscription")).toMatchObject({ plan: "free", status: "halted" });
  });

  it("has nothing to cancel on Free", async () => {
    const { call } = await freeCentre();
    expect((await call("POST", "/subscription/cancel")).status).toBe(409);
  });
});

describe("what Free covers", () => {
  it("stops at 25 active students, and asks for Pro", async () => {
    const { json, call, studentId, app } = await freeCentre();
    for (let i = 2; i <= 25; i++) await call("POST", "/students", { ...AARAV, name: `Student ${i}` });

    const over = await call("POST", "/students", { ...AARAV, name: "Student 26" });
    expect(over.status).toBe(402);
    expect((await over.json()).error).toMatchObject({ code: "plan_limit", message: "Free covers up to 25 students. Go Pro for more." });

    // A student who left frees a place; bringing them back takes it again.
    await call("PATCH", `/students/${studentId}`, { status: "left" });
    expect((await call("POST", "/students", { ...AARAV, name: "Student 26" })).status).toBe(201);
    expect((await call("PATCH", `/students/${studentId}`, { status: "active" })).status).toBe(402);

    await app.db.update(centres).set({ plan: "pro" });
    expect((await call("PATCH", `/students/${studentId}`, { status: "active" })).status).toBe(200);
    expect((await json("GET", "/subscription")).students).toEqual({ active: 26, max: null });
  });

  it("keeps the centre's own Razorpay for Pro", async () => {
    const { call } = await freeCentre();
    const res = await call("PUT", "/centre/razorpay", { keyId: "rzp_test_abc", keySecret: "s", webhookSecret: "w" });
    expect(res.status).toBe(402);
    expect((await res.json()).error.message).toBe("Connecting your own Razorpay account comes with Pro.");
  });
});
