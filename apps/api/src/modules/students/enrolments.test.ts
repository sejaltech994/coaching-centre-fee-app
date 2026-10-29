import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

const AARAV = { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "98765 43210" };

async function owner(email = "asha@example.com", app?: Awaited<ReturnType<typeof createTestApp>>) {
  app ??= await createTestApp();
  const { body } = await app.login(email);
  const token = body.accessToken as string;
  const batch = (
    await (
      await app.call("POST", "/batches", {
        token,
        body: { name: "Class 10 Maths", subject: "Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" },
      })
    ).json()
  ).batch.id as string;
  const student = (await (await app.call("POST", "/students", { token, body: AARAV })).json()).student.id as string;
  const enrol = (body: Record<string, unknown> = { studentId: student, batchId: batch }) =>
    app.call("POST", "/enrolments", { token, body });
  return { app, token, batch, student, enrol };
}

describe("POST /enrolments", () => {
  it("puts a student in a batch from today", async () => {
    const { app, token, student, enrol } = await owner();

    const res = await enrol();

    expect(res.status).toBe(201);
    expect((await res.json()).enrolment).toEqual({
      id: expect.any(String),
      batch: { id: expect.any(String), name: "Class 10 Maths" },
      startDate: "2026-11-02",
      endDate: null,
    });
    const { student: s } = await (await app.call("GET", `/students/${student}`, { token })).json();
    expect(s.batches.map((b: { name: string }) => b.name)).toEqual(["Class 10 Maths"]);
  });

  it("won't put a student in the same batch twice", async () => {
    const { enrol } = await owner();
    await enrol();

    const res = await enrol();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("already_enrolled");
  });

  it("won't put a student who has left in a batch", async () => {
    const { app, token, student, enrol } = await owner();
    await app.call("PATCH", `/students/${student}`, { token, body: { status: "left" } });

    const res = await enrol();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("student_left");
  });

  it("only joins the owner's own students and active batches", async () => {
    const asha = await owner();
    const ravi = await owner("ravi@example.com", asha.app);
    await asha.app.call("DELETE", `/batches/${asha.batch}`, { token: asha.token });

    for (const body of [
      { studentId: ravi.student, batchId: asha.batch },
      { studentId: asha.student, batchId: ravi.batch },
      { studentId: asha.student, batchId: asha.batch },
      { studentId: "nope", batchId: "nope" },
    ]) {
      expect((await asha.enrol(body)).status).toBe(404);
    }
  });
});

describe("PATCH /enrolments/:id", () => {
  it("ends an enrolment, taking the student out of the batch", async () => {
    const { app, token, student, enrol } = await owner();
    const { enrolment } = await (await enrol()).json();

    const res = await app.call("PATCH", `/enrolments/${enrolment.id}`, { token, body: { endDate: "2026-11-02" } });

    expect(res.status).toBe(200);
    expect((await res.json()).enrolment.endDate).toBe("2026-11-02");
    const { student: s } = await (await app.call("GET", `/students/${student}`, { token })).json();
    expect(s.batches).toEqual([]);
  });

  it("refuses an end date before the start or that isn't a date", async () => {
    const { app, token, enrol } = await owner();
    const { enrolment } = await (await enrol()).json();

    for (const endDate of ["2026-11-01", "soon"]) {
      const res = await app.call("PATCH", `/enrolments/${enrolment.id}`, { token, body: { endDate } });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields).toHaveProperty("endDate");
    }
  });

  it("is not found for another owner's enrolment", async () => {
    const asha = await owner();
    const { enrolment } = await (await asha.enrol()).json();
    const ravi = await owner("ravi@example.com", asha.app);

    const res = await asha.app.call("PATCH", `/enrolments/${enrolment.id}`, { token: ravi.token, body: { endDate: "2026-11-02" } });

    expect(res.status).toBe(404);
  });
});
