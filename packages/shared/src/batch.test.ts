import { describe, expect, it } from "vitest";
import { formatBatchSchedule, formatDays, formatTimeRange, validateBatch } from "./batch";

const valid = { name: "Class 10 Maths", subject: "Mathematics", days: ["mon", "wed", "fri"], startTime: "16:00", endTime: "17:30" };

describe("validateBatch", () => {
  it("accepts a complete batch, trimming text and ordering days Monday first", () => {
    const result = validateBatch({ ...valid, name: "  Class 10 Maths ", subject: " Mathematics ", days: ["fri", "mon", "wed"] });

    expect(result).toEqual({
      ok: true,
      value: { name: "Class 10 Maths", subject: "Mathematics", days: ["mon", "wed", "fri"], startTime: "16:00", endTime: "17:30" },
    });
  });

  it("treats a blank or missing subject as none", () => {
    expect(validateBatch({ ...valid, subject: "   " })).toMatchObject({ ok: true, value: { subject: null } });
    const { subject: _omitted, ...withoutSubject } = valid;
    expect(validateBatch(withoutSubject)).toMatchObject({ ok: true, value: { subject: null } });
  });

  it("drops repeated days", () => {
    expect(validateBatch({ ...valid, days: ["mon", "mon", "sat"] })).toMatchObject({ value: { days: ["mon", "sat"] } });
  });

  it.each([
    ["name", { name: "  " }, "Give the batch a name."],
    ["name", { name: "x".repeat(81) }, "Keep the name to 80 characters or fewer."],
    ["subject", { subject: "x".repeat(81) }, "Keep the subject to 80 characters or fewer."],
    ["days", { days: [] }, "Pick at least one day."],
    ["days", { days: ["funday"] }, "Pick at least one day."],
    ["startTime", { startTime: "4pm" }, "Use a 24-hour time like 16:30."],
    ["endTime", { endTime: "24:00" }, "Use a 24-hour time like 16:30."],
    ["endTime", { startTime: "17:00", endTime: "16:00" }, "The batch must end after it starts."],
    ["endTime", { startTime: "17:00", endTime: "17:00" }, "The batch must end after it starts."],
  ])("explains a bad %s", (field, change, message) => {
    const result = validateBatch({ ...valid, ...change });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields[field]).toBe(message);
  });

  it("reports every field at fault at once", () => {
    const result = validateBatch({ name: "", days: [], startTime: "17:00", endTime: "16:00" });
    expect(!result.ok && Object.keys(result.fields).sort()).toEqual(["days", "endTime", "name"]);
  });

  it("rejects input that isn't an object", () => {
    expect(validateBatch(null).ok).toBe(false);
    expect(validateBatch("Class 10").ok).toBe(false);
  });
});

// Formats follow the Batches design canvas: "Mon · Wed · Fri", "5:00–6:30 pm".
describe("formatting", () => {
  it("lists days Monday first, dot-separated", () => {
    expect(formatDays(["fri", "mon", "wed"])).toBe("Mon · Wed · Fri");
  });

  it.each([
    ["17:00", "18:30", "5:00–6:30 pm"],
    ["16:00", "17:30", "4:00–5:30 pm"],
    ["10:00", "13:00", "10:00 am–1:00 pm"],
    ["07:05", "08:00", "7:05–8:00 am"],
    ["00:00", "00:30", "12:00–12:30 am"],
    ["11:30", "12:00", "11:30 am–12:00 pm"],
  ])("shows %s to %s as %s", (start, end, shown) => {
    expect(formatTimeRange(start, end)).toBe(shown);
  });

  it("summarises a batch's schedule for a card", () => {
    expect(formatBatchSchedule(valid)).toBe("Mon · Wed · Fri · 4:00–5:30 pm");
  });
});
