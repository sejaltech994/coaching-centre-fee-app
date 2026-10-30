import { describe, expect, it } from "vitest";
import { addDays, periodLabel, periodsToBill } from "./billing";

const monthly = { cycle: "monthly" as const, dueDay: 5 };
const quarterly = { cycle: "quarterly" as const, dueDay: 10 };
const oneTime = { cycle: "one_time" as const, dueDay: null };

describe("addDays", () => {
  it("moves across months, years and leap days", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-25", 7)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("periodsToBill", () => {
  it("bills a monthly plan for the calendar month, due on the plan's day", () => {
    expect(periodsToBill(monthly, { startDate: "2026-11-01", endDate: null }, "2026-11-02")).toEqual([
      { start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-05" },
    ]);
  });

  it("makes someone who joins after the due day due on the day they join", () => {
    expect(periodsToBill(monthly, { startDate: "2026-11-20", endDate: null }, "2026-11-20")).toEqual([
      { start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-20" },
    ]);
  });

  it("adds the next month once it starts within 7 days", () => {
    const enrolment = { startDate: "2026-11-02", endDate: null };
    expect(periodsToBill(monthly, enrolment, "2026-11-23")).toHaveLength(1);
    expect(periodsToBill(monthly, enrolment, "2026-11-24")).toEqual([
      { start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-05" },
      { start: "2026-12-01", end: "2026-12-31", dueDate: "2026-12-05" },
    ]);
  });

  it("never bills months before today, however long ago the student joined", () => {
    expect(periodsToBill(monthly, { startDate: "2025-01-15", endDate: null }, "2026-11-02")).toEqual([
      { start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-05" },
    ]);
  });

  it("bills a quarterly plan by calendar quarter, due in its first month", () => {
    expect(periodsToBill(quarterly, { startDate: "2026-11-02", endDate: null }, "2026-11-02")).toEqual([
      { start: "2026-10-01", end: "2026-12-31", dueDate: "2026-11-02" },
    ]);
    expect(periodsToBill(quarterly, { startDate: "2026-11-02", endDate: null }, "2026-12-26")).toEqual([
      { start: "2026-10-01", end: "2026-12-31", dueDate: "2026-11-02" },
      { start: "2027-01-01", end: "2027-03-31", dueDate: "2027-01-10" },
    ]);
  });

  it("bills a one-time plan once, due the day the student joins", () => {
    expect(periodsToBill(oneTime, { startDate: "2026-11-02", endDate: null }, "2026-12-26")).toEqual([
      { start: "2026-11-02", end: "2026-11-02", dueDate: "2026-11-02" },
    ]);
  });

  it("bills nothing that starts after the student left", () => {
    expect(periodsToBill(monthly, { startDate: "2026-10-01", endDate: "2026-11-30" }, "2026-11-28")).toEqual([
      { start: "2026-11-01", end: "2026-11-30", dueDate: "2026-11-05" },
    ]);
    expect(periodsToBill(monthly, { startDate: "2026-10-01", endDate: "2026-10-31" }, "2026-11-02")).toEqual([]);
  });

  it("bills a future start only once it's within 7 days", () => {
    expect(periodsToBill(monthly, { startDate: "2026-12-15", endDate: null }, "2026-12-07")).toEqual([]);
    expect(periodsToBill(monthly, { startDate: "2026-12-15", endDate: null }, "2026-12-08")).toEqual([
      { start: "2026-12-01", end: "2026-12-31", dueDate: "2026-12-15" },
    ]);
  });
});

describe("periodLabel", () => {
  it.each([
    ["monthly", "2026-11-01", "Nov 2026"],
    ["quarterly", "2026-10-01", "Oct–Dec 2026"],
    ["one_time", "2026-11-02", "One-time"],
  ] as const)("names a %s period", (cycle, start, label) => {
    expect(periodLabel(cycle, start)).toBe(label);
  });
});
