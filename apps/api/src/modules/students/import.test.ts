import { describe, expect, it } from "vitest";
import { owner } from "../../test/owner";

const HEADINGS = "Student name,Parent name,Parent mobile,WhatsApp consent,Batches";

describe("POST /students/import", () => {
  it("previews every row, with what's wrong on each, before adding anyone", async () => {
    const { json } = await owner();
    const csv = [
      HEADINGS,
      "Diya Rao,Ravi Rao,91234 56789,yes,Class 10 Maths",
      "Kabir,,12345,maybe,Class 99",
      "Aarav Sharma,Neha Sharma,98765 43210,no,",
    ].join("\n");

    const preview = await json("POST", "/students/import", { csv, dryRun: true });

    expect(preview).toEqual({
      rows: [
        { line: 2, name: "Diya Rao", parentName: "Ravi Rao", parentPhone: "+919123456789", whatsappOptIn: true, batches: ["Class 10 Maths"], errors: {} },
        {
          line: 3,
          name: "Kabir",
          parentName: "",
          parentPhone: "12345",
          whatsappOptIn: false,
          batches: ["Class 99"],
          errors: {
            parentName: "Enter the parent’s name.",
            parentPhone: "Enter a 10-digit Indian mobile number.",
            whatsappOptIn: "Write yes or no.",
            batches: "No active batch called “Class 99”.",
          },
        },
        {
          line: 4,
          name: "Aarav Sharma",
          parentName: "Neha Sharma",
          parentPhone: "+919876543210",
          whatsappOptIn: false,
          batches: [],
          errors: { name: "Already a student here, with the same parent’s number." },
        },
      ],
      valid: 1,
      invalid: 2,
      imported: 0,
    });
    expect((await json("GET", "/students")).students).toHaveLength(1);
  });

  it("adds everyone, in their batches and billed, when every row is right", async () => {
    const { json, list } = await owner();
    const csv = `${HEADINGS}\r\n"Rao, Diya",Ravi Rao,9123456789,Y,class 10 maths\r\nKabir Shah,Meera Shah,+91 99887 76655,,\r\n`;

    const done = await json("POST", "/students/import", { csv });

    expect(done).toMatchObject({ valid: 2, invalid: 0, imported: 2 });
    const { students } = await json("GET", "/students");
    expect(students.map((s: { name: string }) => s.name)).toEqual(["Aarav Sharma", "Kabir Shah", "Rao, Diya"]);
    expect((await list()).invoices.map((i: { student: { name: string } }) => i.student.name).sort()).toEqual(["Aarav Sharma", "Rao, Diya"]);
  });

  it("adds no one if any row is wrong", async () => {
    const { call, json } = await owner();
    const res = await call("POST", "/students/import", { csv: `${HEADINGS}\nDiya Rao,Ravi Rao,9123456789,yes,\nKabir,,,,\n` });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "import_has_errors", rows: expect.any(Array) });
    expect((await json("GET", "/students")).students).toHaveLength(1);
  });

  it("needs the template's headings, and at most 500 students", async () => {
    const { call } = await owner();
    const wrong = await call("POST", "/students/import", { csv: "Name,Phone\nDiya,9123456789\n" });
    expect((await wrong.json()).error.fields).toEqual({
      csv: "Start with the template’s headings: Student name, Parent name, Parent mobile, WhatsApp consent, Batches.",
    });
    const empty = await call("POST", "/students/import", { csv: `${HEADINGS}\n` });
    expect((await empty.json()).error.fields).toEqual({ csv: "The file has no students in it." });
    const huge = `${HEADINGS}\n${Array.from({ length: 501 }, (_, i) => `S${i},P,9123456789,no,`).join("\n")}`;
    expect((await (await call("POST", "/students/import", { csv: huge })).json()).error.fields).toEqual({
      csv: "Import up to 500 students at a time.",
    });
  });

  it("keeps a Free centre within its 25 students", async () => {
    const { call } = await owner();
    const rows = Array.from({ length: 25 }, (_, i) => `Student ${i},Parent,9123456789,no,`).join("\n");
    const res = await call("POST", "/students/import", { csv: `${HEADINGS}\n${rows}` });
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("plan_limit");
  });
});
