import { authIdentities, centres, invoices, students, users } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { DAY, owner } from "../../test/owner";

describe("GET /me/export", () => {
  it("downloads everything the centre has as JSON, without any keys or tokens", async () => {
    const { call } = await owner("asha@example.com", undefined, { plan: "pro" });
    await call("PUT", "/centre/razorpay", { keyId: "rzp_test_abc", keySecret: "very-secret", webhookSecret: "hook-secret" });

    const res = await call("GET", "/me/export");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="chukta-export-2026-11-02.json"');
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data).toMatchObject({
      exportedAt: "2026-11-02T04:30:00.000Z",
      owner: { name: "Asha Sharma", email: "asha@example.com" },
      centre: { name: "Sunrise Classes", city: "Pune" },
      batches: [{ name: "Class 10 Maths" }],
      feePlans: [{ name: "Monthly", amountPaise: 250000 }],
      students: [{ name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "+919876543210" }],
      invoices: [{ number: 1, amountPaise: 250000, status: "pending" }],
      payments: [],
    });
    for (const secret of ["very-secret", "hook-secret", "tokenHash", "token_hash", "publicToken"]) expect(text).not.toContain(secret);
  });
});

describe("deleting the account", () => {
  it("needs the centre's name typed exactly", async () => {
    const { call } = await owner();
    const res = await call("DELETE", "/me", { confirm: "sunrise" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ confirm: "Type your centre’s name exactly to confirm." });
  });

  it("signs every device out and deletes in 30 days, unless the owner keeps the account", async () => {
    const { app, call } = await owner();

    const res = await call("DELETE", "/me", { confirm: "Sunrise Classes" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletesAt: "2026-12-02T04:30:00.000Z" });
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");

    // Signing in again within 30 days shows when, and the owner can keep the account.
    const back = await app.login("asha@example.com");
    const token = back.body.accessToken;
    expect((await (await app.call("GET", "/me", { token })).json()).centre.deletesAt).toBe("2026-12-02T04:30:00.000Z");
    expect((await app.call("POST", "/me/restore", { token })).status).toBe(200);
    expect((await (await app.call("GET", "/me", { token })).json()).centre.deletesAt).toBeNull();
  });

  it("after 30 days erases the owner and the students' names, keeps the fee records, and stops all work", async () => {
    const { app, call, advance } = await owner();
    await call("DELETE", "/me", { confirm: "Sunrise Classes" });

    await advance(31 * DAY);
    await app.runJobs();

    const [centre] = await app.db.select().from(centres);
    expect(centre).toMatchObject({ name: null, city: null, ownerPhone: null, deletedAt: expect.any(Date) });
    const [user] = await app.db.select().from(users);
    expect(user).toMatchObject({ name: null, email: null, phone: null });
    expect(await app.db.select().from(authIdentities)).toEqual([]);
    const [student] = await app.db.select().from(students);
    expect(student).toMatchObject({ name: "Former student", parentName: "Former parent", parentPhone: "deleted", whatsappOptIn: false });
    // November's bill is kept; no new bills for December.
    expect((await app.db.select().from(invoices)).map((i) => i.periodStart)).toEqual(["2026-11-01"]);

    // The same Google account can start again, as a new owner.
    const again = await app.login("asha@example.com");
    expect(again.body.isNewAccount).toBe(true);
  });
});
