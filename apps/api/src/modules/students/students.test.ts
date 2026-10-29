import { students } from "@chukta/db";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/harness";

type App = Awaited<ReturnType<typeof createTestApp>>;

const AARAV = { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "98765 43210", whatsappOptIn: true };

/** A signed-in owner with two batches; `now` is 2 Nov 2026, 10:00 in India. */
async function owner(email = "asha@example.com") {
  const app = await createTestApp();
  const { body } = await app.login(email);
  const token = body.accessToken as string;
  const batch = async (name: string) =>
    (
      await (
        await app.call("POST", "/batches", {
          token,
          body: { name, subject: "Maths", days: ["mon"], startTime: "16:00", endTime: "17:00" },
        })
      ).json()
    ).batch.id as string;
  const maths = await batch("Class 10 Maths");
  const science = await batch("Class 10 Science");
  const add = async (student: Record<string, unknown> = AARAV) =>
    app.call("POST", "/students", { token, body: student });
  const added = async (student: Record<string, unknown> = AARAV) => (await (await add(student)).json()).student;
  const list = async (query = "") => (await app.call("GET", `/students${query}`, { token })).json();
  return { app, token, maths, science, add, added, list };
}

async function otherOwner(app: App) {
  const { body } = await app.login("ravi@example.com");
  return body.accessToken as string;
}

describe("POST /students", () => {
  it("adds an active student, recording the parent's WhatsApp consent, in the batches chosen from today", async () => {
    const { app, add, maths } = await owner();

    const res = await add({ ...AARAV, batchIds: [maths] });

    expect(res.status).toBe(201);
    const { student } = await res.json();
    expect(student).toEqual({
      id: expect.any(String),
      name: "Aarav Sharma",
      parentName: "Neha Sharma",
      parentPhone: "+919876543210",
      whatsappOptIn: true,
      status: "active",
      batches: [{ id: maths, name: "Class 10 Maths", enrolmentId: expect.any(String), since: "2026-11-02" }],
    });
    const [row] = await app.db.select().from(students);
    expect(row!.whatsappOptInAt).toEqual(app.clock.now());
  });

  it("can add a student to no batch yet", async () => {
    const { added } = await owner();
    expect((await added()).batches).toEqual([]);
  });

  it("names every field at fault and adds nothing", async () => {
    const { app, add } = await owner();

    const res = await add({ name: "", parentName: "", parentPhone: "123" });

    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fields).sort()).toEqual(["name", "parentName", "parentPhone"]);
    expect(await app.db.select().from(students)).toEqual([]);
  });

  it("only puts students in the owner's own active batches, and adds nothing otherwise", async () => {
    const { app, token, add, maths } = await owner();
    const ravisBatch = (
      await (
        await app.call("POST", "/batches", {
          token: await otherOwner(app),
          body: { name: "Kathak", subject: "Dance", days: ["sat"], startTime: "10:00", endTime: "11:00" },
        })
      ).json()
    ).batch.id;
    await app.call("DELETE", `/batches/${maths}`, { token });

    for (const batchIds of [[ravisBatch], [maths], ["not-a-batch"]]) {
      const res = await add({ ...AARAV, batchIds });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields).toEqual({ batchIds: "Pick from your active batches." });
    }
    expect(await app.db.select().from(students)).toEqual([]);
  });

  it("requires a valid access token", async () => {
    const app = await createTestApp();
    expect((await app.call("POST", "/students", { body: AARAV })).status).toBe(401);
  });
});

describe("GET /students", () => {
  it("lists active students by name, with their current batches", async () => {
    const { added, list, maths } = await owner();
    await added({ ...AARAV, name: "Zoya Khan", batchIds: [maths] });
    await added({ ...AARAV, name: "aarav Sharma" });

    const { students: rows, nextCursor } = await list();

    expect(rows.map((s: { name: string }) => s.name)).toEqual(["aarav Sharma", "Zoya Khan"]);
    expect(rows[1].batches.map((b: { name: string }) => b.name)).toEqual(["Class 10 Maths"]);
    expect(nextCursor).toBeNull();
  });

  it("filters by status, batch and a search of student and parent names", async () => {
    const { app, token, added, list, maths } = await owner();
    const aarav = await added({ ...AARAV, batchIds: [maths] });
    await added({ ...AARAV, name: "Ishita Rao", parentName: "Suresh Rao" });
    const left = await added({ ...AARAV, name: "Kabir Mehta", parentName: "Pooja Mehta" });
    await app.call("PATCH", `/students/${left.id}`, { token, body: { status: "left" } });

    const names = async (query: string) => (await list(query)).students.map((s: { name: string }) => s.name);
    expect(await names("?status=left")).toEqual(["Kabir Mehta"]);
    expect(await names("?status=all")).toEqual(["Aarav Sharma", "Ishita Rao", "Kabir Mehta"]);
    expect(await names(`?batchId=${maths}`)).toEqual([aarav.name]);
    expect(await names("?q=suresh")).toEqual(["Ishita Rao"]);
    expect(await names("?q=SHAR")).toEqual(["Aarav Sharma"]);
  });

  it("pages through students with a cursor", async () => {
    const { added, list } = await owner();
    for (const name of ["A", "B", "C"]) await added({ ...AARAV, name });

    const first = await list("?limit=2");
    const second = await list(`?limit=2&cursor=${first.nextCursor}`);

    expect(first.students.map((s: { name: string }) => s.name)).toEqual(["A", "B"]);
    expect(second.students.map((s: { name: string }) => s.name)).toEqual(["C"]);
    expect(second.nextCursor).toBeNull();
  });

  it("shows an owner only their own students", async () => {
    const { app, added } = await owner();
    await added();

    const res = await app.call("GET", "/students", { token: await otherOwner(app) });

    expect((await res.json()).students).toEqual([]);
  });

  it("explains a query it can't read", async () => {
    const { list } = await owner();
    expect((await list("?status=graduated")).error.code).toBe("invalid_request");
  });
});

describe("GET /students/:id", () => {
  it("shows a student with every batch they've been in", async () => {
    const { app, token, added, maths, science } = await owner();
    const aarav = await added({ ...AARAV, batchIds: [maths, science] });
    const enrolment = aarav.batches.find((b: { id: string }) => b.id === science).enrolmentId;
    await app.call("PATCH", `/enrolments/${enrolment}`, { token, body: { endDate: "2026-11-02" } });

    const { student } = await (await app.call("GET", `/students/${aarav.id}`, { token })).json();

    expect(student.batches.map((b: { name: string }) => b.name)).toEqual(["Class 10 Maths"]);
    expect(student.enrolments).toEqual([
      { id: expect.any(String), batch: { id: maths, name: "Class 10 Maths" }, startDate: "2026-11-02", endDate: null },
      { id: enrolment, batch: { id: science, name: "Class 10 Science" }, startDate: "2026-11-02", endDate: "2026-11-02" },
    ]);
  });

  it("is not found for another owner's student, or one that doesn't exist", async () => {
    const { app, added } = await owner();
    const aarav = await added();
    const ravi = await otherOwner(app);

    for (const id of [aarav.id, "00000000-0000-4000-8000-000000000000", "nope"]) {
      expect((await app.call("GET", `/students/${id}`, { token: ravi })).status).toBe(404);
    }
  });
});

describe("PATCH /students/:id", () => {
  it("changes a student's details and the parent's consent", async () => {
    const { app, token, added } = await owner();
    const aarav = await added();

    const res = await app.call("PATCH", `/students/${aarav.id}`, {
      token,
      body: { name: "Aarav S. Sharma", parentPhone: "91234 56789", whatsappOptIn: false },
    });

    expect(res.status).toBe(200);
    expect((await res.json()).student).toMatchObject({
      name: "Aarav S. Sharma",
      parentName: "Neha Sharma",
      parentPhone: "+919123456789",
      whatsappOptIn: false,
    });
    const [row] = await app.db.select().from(students);
    expect(row!.whatsappOptInAt).toBeNull();
  });

  it("marks a student as left, ending their batches today, and back as active", async () => {
    const { app, token, added, maths } = await owner();
    const aarav = await added({ ...AARAV, batchIds: [maths] });

    const left = await (await app.call("PATCH", `/students/${aarav.id}`, { token, body: { status: "left" } })).json();
    expect(left.student).toMatchObject({ status: "left", batches: [] });
    const { student } = await (await app.call("GET", `/students/${aarav.id}`, { token })).json();
    expect(student.enrolments[0].endDate).toBe("2026-11-02");

    const back = await (await app.call("PATCH", `/students/${aarav.id}`, { token, body: { status: "active" } })).json();
    expect(back.student).toMatchObject({ status: "active", batches: [] });
  });

  it("names the field at fault and changes nothing", async () => {
    const { app, token, added } = await owner();
    const aarav = await added();

    const res = await app.call("PATCH", `/students/${aarav.id}`, { token, body: { parentPhone: "1" } });

    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ parentPhone: "Enter a 10-digit Indian mobile number." });
  });

  it("is not found for another owner's student", async () => {
    const { app, added } = await owner();
    const aarav = await added();
    const res = await app.call("PATCH", `/students/${aarav.id}`, { token: await otherOwner(app), body: { name: "X" } });
    expect(res.status).toBe(404);
  });
});
