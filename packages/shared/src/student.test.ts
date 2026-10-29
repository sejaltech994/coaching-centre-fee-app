import { describe, expect, it } from "vitest";
import { validateStudent } from "./student";

const valid = { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "98765 43210", whatsappOptIn: true };

describe("validateStudent", () => {
  it("accepts a student, trimming names and writing the parent's number as +91", () => {
    expect(validateStudent({ ...valid, name: "  Aarav Sharma ", parentName: " Neha Sharma " })).toEqual({
      ok: true,
      value: { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "+919876543210", whatsappOptIn: true },
    });
  });

  it("treats missing WhatsApp consent as not given", () => {
    const { whatsappOptIn: _consent, ...withoutConsent } = valid;
    expect(validateStudent(withoutConsent)).toMatchObject({ ok: true, value: { whatsappOptIn: false } });
  });

  it.each([
    ["name", { name: " " }, "Enter the student’s name."],
    ["name", { name: "x".repeat(81) }, "Keep the student’s name to 80 characters or fewer."],
    ["parentName", { parentName: "" }, "Enter the parent’s name."],
    ["parentName", { parentName: "x".repeat(81) }, "Keep the parent’s name to 80 characters or fewer."],
    ["parentPhone", { parentPhone: "12345" }, "Enter a 10-digit Indian mobile number."],
    ["parentPhone", { parentPhone: undefined }, "Enter a 10-digit Indian mobile number."],
    ["whatsappOptIn", { whatsappOptIn: "yes" }, "Say whether the parent agreed to WhatsApp messages."],
  ])("explains a bad %s", (field, change, message) => {
    const result = validateStudent({ ...valid, ...change });
    expect(!result.ok && result.fields[field]).toBe(message);
  });

  it("names every field at fault at once", () => {
    const result = validateStudent({ name: "", parentName: "", parentPhone: "1" });
    expect(!result.ok && Object.keys(result.fields).sort()).toEqual(["name", "parentName", "parentPhone"]);
  });
});
