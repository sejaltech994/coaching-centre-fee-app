import { describe, expect, it } from "vitest";
import { MESSAGE_TEMPLATES, messageFor, reminderKindOn, renderMessage, type MessageValues } from "./messages";

const values: MessageValues = {
  parent: "Neha",
  centre: "Sunrise Classes",
  student: "Aarav",
  amount: "₹2,500",
  period: "Nov 2026",
  due: "5 Nov 2026",
  link: "https://chukta.example/pay/?t=abc",
};

describe("renderMessage", () => {
  it("fills a fee-due reminder in the gentle tone", () => {
    expect(renderMessage("fee_due", "gentle", values)).toBe(
      "Hello Neha, a gentle reminder from Sunrise Classes: Aarav's fee of ₹2,500 for Nov 2026 is due on 5 Nov 2026. You can pay here: https://chukta.example/pay/?t=abc",
    );
  });

  it("has a firm tone for every reminder, and one tone for the thank-you", () => {
    expect(renderMessage("fee_overdue", "firm", values)).toBe(
      "Hello Neha, Aarav's fee of ₹2,500 for Nov 2026 at Sunrise Classes was due on 5 Nov 2026 and is still unpaid. Please pay today: https://chukta.example/pay/?t=abc",
    );
    expect(renderMessage("payment_received", "firm", values)).toBe(
      "Thank you, Neha! Sunrise Classes has received ₹2,500 for Aarav (Nov 2026). Your receipt: https://chukta.example/pay/?t=abc",
    );
  });

  it("uses only variables from the fixed list, in Meta's order", () => {
    for (const template of Object.values(MESSAGE_TEMPLATES).flatMap((byTone) => Object.values(byTone))) {
      const used = [...template.body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(used).toEqual(template.variables);
      expect(template.metaName).toMatch(/^chukta_[a-z_]+_v\d+$/);
    }
  });
});

describe("reminderKindOn", () => {
  it("names the schedule's days: 3 before, on the day, then 3 and 7 after", () => {
    const due = "2026-11-05";
    expect(reminderKindOn(due, "2026-11-01")).toBeNull();
    expect(reminderKindOn(due, "2026-11-02")).toBe("pre_due");
    expect(reminderKindOn(due, "2026-11-05")).toBe("due");
    expect(reminderKindOn(due, "2026-11-08")).toBe("overdue_3");
    expect(reminderKindOn(due, "2026-11-12")).toBe("overdue_7");
    expect(reminderKindOn(due, "2026-11-06")).toBeNull();
  });
});

describe("messageFor", () => {
  it("says the fee is due up to the due date, and overdue after it", () => {
    expect(messageFor("2026-11-05", "2026-11-05")).toBe("fee_due");
    expect(messageFor("2026-11-05", "2026-11-06")).toBe("fee_overdue");
  });
});
