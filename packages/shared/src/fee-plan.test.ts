import { describe, expect, it } from "vitest";
import { describeFeePlan, formatRupees, rupeesToPaise, validateFeePlan } from "./fee-plan";

const monthly = { name: "Class 10 monthly", amountPaise: 250000, cycle: "monthly", dueDay: 5, lateFeePaise: 10000, lateFeeAfterDays: 7 };

describe("validateFeePlan", () => {
  it("accepts a monthly plan with a late fee", () => {
    expect(validateFeePlan({ ...monthly, name: " Class 10 monthly " })).toEqual({ ok: true, value: monthly });
  });

  it("accepts a plan without a late fee", () => {
    expect(validateFeePlan({ ...monthly, lateFeePaise: null, lateFeeAfterDays: null })).toMatchObject({
      ok: true,
      value: { lateFeePaise: null, lateFeeAfterDays: null },
    });
    const { lateFeePaise: _fee, lateFeeAfterDays: _days, ...withoutLateFee } = monthly;
    expect(validateFeePlan(withoutLateFee)).toMatchObject({ ok: true, value: { lateFeePaise: null, lateFeeAfterDays: null } });
  });

  it("has no due day for a one-time fee", () => {
    expect(validateFeePlan({ ...monthly, cycle: "one_time", dueDay: 5 })).toMatchObject({ ok: true, value: { dueDay: null } });
  });

  it.each([
    ["name", { name: " " }, "Enter a name for the plan."],
    ["name", { name: "x".repeat(61) }, "Keep the name to 60 characters or fewer."],
    ["amountPaise", { amountPaise: 50 }, "Enter an amount of at least ₹1."],
    ["amountPaise", { amountPaise: 10000001 }, "Keep the amount to ₹1,00,000 or less."],
    ["amountPaise", { amountPaise: 2500.5 }, "Enter an amount of at least ₹1."],
    ["cycle", { cycle: "weekly" }, "Pick how often the fee is due."],
    ["dueDay", { dueDay: 31 }, "Pick a due day from 1 to 28."],
    ["dueDay", { dueDay: null }, "Pick a due day from 1 to 28."],
    ["lateFeePaise", { lateFeePaise: 0 }, "Enter a late fee of at least ₹1, or leave it empty."],
    ["lateFeePaise", { lateFeePaise: 300000 }, "The late fee can’t be more than the fee."],
    ["lateFeeAfterDays", { lateFeeAfterDays: null }, "Say after how many days (1 to 60) the late fee applies."],
    ["lateFeeAfterDays", { lateFeeAfterDays: 61 }, "Say after how many days (1 to 60) the late fee applies."],
  ])("explains a bad %s", (field, change, message) => {
    const result = validateFeePlan({ ...monthly, ...change });
    expect(!result.ok && result.fields[field]).toBe(message);
  });
});

describe("rupeesToPaise", () => {
  it.each([
    ["2500", 250000],
    ["2,500", 250000],
    [" ₹2,500.50 ", 250050],
    ["0.5", 50],
  ])("reads %s as %i paise", (text, paise) => {
    expect(rupeesToPaise(text)).toBe(paise);
  });

  it.each(["", "abc", "1.234", "-5", "2,50,0x"])("returns null for %j", (text) => {
    expect(rupeesToPaise(text)).toBeNull();
  });
});

describe("formatRupees", () => {
  it.each([
    [250000, "₹2,500"],
    [10000000, "₹1,00,000"],
    [250050, "₹2,500.50"],
    [10000, "₹100"],
  ])("writes %i paise as %s, with Indian grouping", (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });
});

describe("describeFeePlan", () => {
  it.each([
    [{ cycle: "monthly", amountPaise: 250000, dueDay: 5 }, "Monthly · ₹2,500 · due on the 5th"],
    [{ cycle: "monthly", amountPaise: 250000, dueDay: 1 }, "Monthly · ₹2,500 · due on the 1st"],
    [{ cycle: "monthly", amountPaise: 250000, dueDay: 22 }, "Monthly · ₹2,500 · due on the 22nd"],
    [{ cycle: "monthly", amountPaise: 250000, dueDay: 13 }, "Monthly · ₹2,500 · due on the 13th"],
    [{ cycle: "quarterly", amountPaise: 700000, dueDay: 5 }, "Quarterly · ₹7,000 · due 5 Jan, Apr, Jul, Oct"],
    [{ cycle: "one_time", amountPaise: 1200000, dueDay: null }, "One-time · ₹12,000"],
  ] as const)("describes %o", (plan, text) => {
    expect(describeFeePlan(plan)).toBe(text);
  });
});
