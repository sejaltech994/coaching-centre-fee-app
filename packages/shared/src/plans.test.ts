import { describe, expect, it } from "vitest";
import { PLANS, PRO_PRICE_PAISE, studentLimitReached } from "./plans";

describe("plans", () => {
  it("match the pricing page: Free for up to 25 students, Pro at ₹499 a month for any number", () => {
    expect(PRO_PRICE_PAISE).toBe(49900);
    expect(PLANS.free).toEqual({ maxStudents: 25, automaticReminders: false, ownGateway: false });
    expect(PLANS.pro).toEqual({ maxStudents: null, automaticReminders: true, ownGateway: true });
  });

  it("stops a Free centre at 25 active students, never a Pro one", () => {
    expect(studentLimitReached("free", 24)).toBe(false);
    expect(studentLimitReached("free", 25)).toBe(true);
    expect(studentLimitReached("pro", 10_000)).toBe(false);
  });
});
