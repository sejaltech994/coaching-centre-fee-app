import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

const MONTHLY = { name: "Class 10 monthly", amountPaise: 250000, cycle: "monthly", dueDay: 5, lateFeePaise: 10000, lateFeeAfterDays: 7 };
const QUARTERLY = { name: "Class 10 quarterly", amountPaise: 700000, cycle: "quarterly", dueDay: 5 };
const MATHS = { name: "Class 10 Maths", subject: "Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" };
const AARAV = { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "98765 43210" };

/** A signed-in owner, with helpers that call the API as them and return the JSON. */
async function owner(email = "asha@example.com", app?: Awaited<ReturnType<typeof createTestApp>>) {
  app ??= await createTestApp();
  const token = (await app.login(email)).body.accessToken as string;
  const call = (method: string, path: string, body?: unknown) => app!.call(method, path, { token, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  const plan = async (body: object = MONTHLY) => (await json("POST", "/fee-plans", body)).feePlan;
  const batch = async (body: object = MATHS) => (await json("POST", "/batches", body)).batch;
  return { app, token, call, json, plan, batch };
}

describe("fee plans", () => {
  it("creates a plan, in paise", async () => {
    const { call } = await owner();

    const res = await call("POST", "/fee-plans", MONTHLY);

    expect(res.status).toBe(201);
    expect((await res.json()).feePlan).toEqual({ id: expect.any(String), ...MONTHLY, isActive: true });
  });

  it("names every field at fault", async () => {
    const { call } = await owner();

    const res = await call("POST", "/fee-plans", { name: "", amountPaise: 0, cycle: "weekly" });

    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fields).sort()).toEqual(["amountPaise", "cycle", "name"]);
  });

  it("lists active plans by name, and archived ones on request", async () => {
    const { json, plan } = await owner();
    const quarterly = await plan(QUARTERLY);
    await plan({ ...MONTHLY, name: "A monthly" });
    await json("PATCH", `/fee-plans/${quarterly.id}`, { isActive: false });

    expect((await json("GET", "/fee-plans")).feePlans.map((p: { name: string }) => p.name)).toEqual(["A monthly"]);
    expect((await json("GET", "/fee-plans?status=all")).feePlans.map((p: { name: string }) => p.name)).toEqual([
      "A monthly",
      "Class 10 quarterly",
    ]);
  });

  it("changes a plan, checking it as it will be", async () => {
    const { call, plan } = await owner();
    const monthly = await plan();

    const changed = await call("PATCH", `/fee-plans/${monthly.id}`, { amountPaise: 300000, lateFeePaise: null });
    expect(changed.status).toBe(200);
    expect((await changed.json()).feePlan).toMatchObject({ amountPaise: 300000, lateFeePaise: null, lateFeeAfterDays: null });

    const tooSmall = await call("PATCH", `/fee-plans/${monthly.id}`, { amountPaise: 5000, lateFeePaise: 10000, lateFeeAfterDays: 7 });
    expect(tooSmall.status).toBe(400);
    expect((await tooSmall.json()).error.fields).toEqual({ lateFeePaise: "The late fee can’t be more than the fee." });
  });

  it("keeps each centre's plans to itself", async () => {
    const asha = await owner();
    const monthly = await asha.plan();
    const ravi = await owner("ravi@example.com", asha.app);

    expect((await ravi.json("GET", "/fee-plans")).feePlans).toEqual([]);
    expect((await ravi.call("PATCH", `/fee-plans/${monthly.id}`, { name: "Mine" })).status).toBe(404);
    expect((await ravi.call("GET", `/fee-plans/${monthly.id}`)).status).toBe(404);
  });

  it("requires a valid access token", async () => {
    const app = await createTestApp();
    expect((await app.call("GET", "/fee-plans")).status).toBe(401);
  });
});

describe("a batch's fee plan", () => {
  it("is set when the batch is created, and shown with it", async () => {
    const { plan, batch } = await owner();
    const monthly = await plan();

    expect((await batch({ ...MATHS, feePlanId: monthly.id })).feePlan).toEqual(monthly);
    expect((await batch({ ...MATHS, name: "No plan" })).feePlan).toBeNull();
  });

  it("must be one of the centre's active plans", async () => {
    const asha = await owner();
    const archived = await asha.plan();
    await asha.json("PATCH", `/fee-plans/${archived.id}`, { isActive: false });
    const ravi = await owner("ravi@example.com", asha.app);
    const ravisPlan = await ravi.plan();

    for (const feePlanId of [archived.id, ravisPlan.id, "nope"]) {
      const res = await asha.call("POST", "/batches", { ...MATHS, feePlanId });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields).toEqual({ feePlanId: "Pick one of your fee plans." });
    }
  });

  it("is what students who join the batch are billed on, and changing it moves them", async () => {
    const { json, plan, batch } = await owner();
    const monthly = await plan();
    const quarterly = await plan(QUARTERLY);
    const maths = await batch({ ...MATHS, feePlanId: monthly.id });
    const aarav = (await json("POST", "/students", { ...AARAV, batchIds: [maths.id] })).student;
    expect(aarav.batches[0]).toMatchObject({ feePlan: { id: monthly.id }, discountPaise: 0 });

    await json("PATCH", `/batches/${maths.id}`, { feePlanId: quarterly.id });

    const { student } = await json("GET", `/students/${aarav.id}`);
    expect(student.batches[0].feePlan).toMatchObject({ id: quarterly.id, cycle: "quarterly" });
  });
});

describe("a student's discount", () => {
  async function enrolled() {
    const o = await owner();
    const monthly = await o.plan();
    const maths = await o.batch({ ...MATHS, feePlanId: monthly.id });
    const enrolment = (await o.json("POST", "/students", { ...AARAV, batchIds: [maths.id] })).student.batches[0].enrolmentId;
    return { ...o, enrolment };
  }

  it("is set per enrolment, and shown with the batch", async () => {
    const { call, json, enrolment } = await enrolled();

    const res = await call("PATCH", `/enrolments/${enrolment}`, { discountPaise: 25000 });

    expect(res.status).toBe(200);
    expect((await res.json()).enrolment).toMatchObject({ discountPaise: 25000, endDate: null });
    const { students } = await json("GET", "/students");
    expect(students[0].batches[0].discountPaise).toBe(25000);
  });

  it("can't be more than the fee, or negative", async () => {
    const { call, enrolment } = await enrolled();

    for (const discountPaise of [250001, -100, 12.5]) {
      const res = await call("PATCH", `/enrolments/${enrolment}`, { discountPaise });
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()).error.fields)).toEqual(["discountPaise"]);
    }
  });

  it("needs the batch to have a fee plan", async () => {
    const { json, call, batch } = await owner();
    const noPlan = await batch();
    const enrolment = (await json("POST", "/students", { ...AARAV, batchIds: [noPlan.id] })).student.batches[0].enrolmentId;

    const res = await call("PATCH", `/enrolments/${enrolment}`, { discountPaise: 1000 });

    expect((await res.json()).error.fields).toEqual({ discountPaise: "Give the batch a fee plan before a discount." });
  });
});
