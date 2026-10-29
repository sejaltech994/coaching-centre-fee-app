import type { FakeWhatsApp } from "@chukta/integrations";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";
import { AARAV, owner } from "../../test/owner";

/** 2 Nov: Aarav (parent agreed to WhatsApp) and Diya (didn't) in Class 10 Maths since today. */
async function batchDay() {
  const o = await owner();
  await o.call("PATCH", `/students/${o.studentId}`, { whatsappOptIn: true });
  const diya = (await o.json("POST", "/students", { ...AARAV, name: "Diya Rao", parentName: "Ravi Rao", batchIds: [o.batch] })).student.id as string;
  const day = (date = "2026-11-02") => o.json("GET", `/attendance?batchId=${o.batch}&date=${date}`);
  const save = (marks: { studentId: string; present: boolean }[], date = "2026-11-02") =>
    o.call("PUT", "/attendance", { batchId: o.batch, date, marks });
  return { ...o, diya, day, save, whatsapp: o.app.messaging as FakeWhatsApp };
}

describe("GET /attendance", () => {
  it("lists the batch's students on that day, none marked yet", async () => {
    const { day, studentId, diya, batch } = await batchDay();
    expect(await day()).toEqual({
      batch: { id: batch, name: "Class 10 Maths" },
      date: "2026-11-02",
      students: [
        { id: studentId, name: "Aarav Sharma", present: null },
        { id: diya, name: "Diya Rao", present: null },
      ],
    });
  });

  it("leaves out students who hadn't joined yet", async () => {
    const { day } = await batchDay();
    expect((await day("2026-11-01")).students).toEqual([]);
  });

  it("is 404 for another centre's batch, and 400 for a bad query", async () => {
    const asha = await batchDay();
    const ravi = await owner("ravi@example.com", asha.app);
    expect((await ravi.call("GET", `/attendance?batchId=${asha.batch}&date=2026-11-02`)).status).toBe(404);
    expect((await asha.call("GET", `/attendance?batchId=${asha.batch}&date=today`)).status).toBe(400);
  });
});

describe("PUT /attendance", () => {
  it("saves the day's marks and shows them", async () => {
    const { save, day, studentId, diya } = await batchDay();

    const res = await save([{ studentId, present: false }, { studentId: diya, present: true }]);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ absenceAlerts: { sent: 0, skipped: 0 } });
    expect((await day()).students.map((s: { present: boolean }) => s.present)).toEqual([false, true]);
    await save([{ studentId, present: true }]);
    expect((await day()).students.map((s: { present: boolean }) => s.present)).toEqual([true, true]);
  });

  it("with absence alerts on, tells the parent once, and only if they agreed to WhatsApp", async () => {
    const { call, save, studentId, diya, whatsapp, json } = await batchDay();
    expect(await json("GET", "/centre/absence-alerts")).toEqual({ on: false });
    await call("PUT", "/centre/absence-alerts", { on: true });

    const first = await (await save([{ studentId, present: false }, { studentId: diya, present: false }])).json();
    await save([{ studentId, present: false }]);

    expect(first.absenceAlerts).toEqual({ sent: 1, skipped: 1 });
    expect(whatsapp.sent).toEqual([
      {
        to: "+919876543210",
        templateName: "chukta_absence_v1",
        variables: ["Neha Sharma", "Aarav Sharma", "Class 10 Maths", "Sunrise Classes", "2 Nov 2026"],
        messageId: expect.any(String),
      },
    ]);
  });

  it("refuses a future day, or a student who isn't in the batch that day", async () => {
    const { save, studentId, json } = await batchDay();
    const future = await save([{ studentId, present: true }], "2026-11-03");
    expect(future.status).toBe(400);
    expect((await future.json()).error.fields).toEqual({ date: "Attendance can’t be taken for a day that hasn’t come." });

    const other = (await json("POST", "/students", { ...AARAV, name: "Kabir" })).student.id;
    const notIn = await save([{ studentId: other, present: true }]);
    expect((await notIn.json()).error.fields).toEqual({ marks: "Mark only students in this batch that day." });
  });

  it("needs an access token", async () => {
    expect((await (await createTestApp()).call("PUT", "/attendance", { body: {} })).status).toBe(401);
  });
});
