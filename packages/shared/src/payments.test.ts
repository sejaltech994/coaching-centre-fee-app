import { describe, expect, it } from "vitest";
import { upiPayLink, validatePaymentSettings } from "./payments";

describe("validatePaymentSettings", () => {
  it("accepts a UPI ID and the name parents see, trimmed and lower-casing the ID", () => {
    expect(validatePaymentSettings({ upiId: " Sunrise.Classes@OKICICI ", payeeName: " Sunrise Classes " })).toEqual({
      ok: true,
      value: { upiId: "sunrise.classes@okicici", payeeName: "Sunrise Classes" },
    });
  });

  it("lets the owner remove UPI by leaving both empty", () => {
    expect(validatePaymentSettings({ upiId: "", payeeName: "" })).toEqual({ ok: true, value: { upiId: null, payeeName: null } });
  });

  it.each([
    ["upiId", { upiId: "9876543210", payeeName: "Sunrise" }, "Enter a UPI ID like name@bank."],
    ["upiId", { upiId: "a b@okicici", payeeName: "Sunrise" }, "Enter a UPI ID like name@bank."],
    ["payeeName", { upiId: "sunrise@ybl", payeeName: " " }, "Enter the name parents will see when they pay."],
    ["payeeName", { upiId: "sunrise@ybl", payeeName: "x".repeat(61) }, "Keep the name to 60 characters or fewer."],
  ])("explains a bad %s", (field, input, message) => {
    expect(validatePaymentSettings(input)).toEqual({ ok: false, fields: { [field]: message } });
  });
});

describe("upiPayLink", () => {
  it("opens any UPI app with the centre, the exact amount and the bill number filled in", () => {
    expect(upiPayLink({ upiId: "sunrise@okicici", payeeName: "Sunrise Classes", amountPaise: 260050, note: "Bill #12 Aarav" })).toBe(
      "upi://pay?pa=sunrise%40okicici&pn=Sunrise%20Classes&am=2600.50&cu=INR&tn=Bill%20%2312%20Aarav",
    );
  });
});
