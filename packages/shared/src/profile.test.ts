import { describe, expect, it } from "vitest";
import { CENTRE_TYPE_LABELS, CENTRE_TYPES, validateCentre, validateOwner, validateProfile } from "./profile";

const valid = {
  fullName: "Asha Sharma",
  phone: "98765 43210",
  centreName: "Sunrise Classes",
  city: "Pune",
  centreType: "coaching",
  acceptedTerms: true,
};

describe("validateProfile", () => {
  it("accepts a complete profile, trimming text", () => {
    const result = validateProfile({ ...valid, fullName: "  Asha Sharma ", centreName: " Sunrise Classes ", city: " Pune " });

    expect(result).toEqual({
      ok: true,
      value: { fullName: "Asha Sharma", phone: "98765 43210", centreName: "Sunrise Classes", city: "Pune", centreType: "coaching" },
    });
  });

  it("takes no email: it comes from Google", () => {
    expect(validateProfile({ ...valid, email: "someone@example.com" })).toMatchObject({ ok: true, value: { phone: "98765 43210" } });
    expect(validateProfile({ ...valid, email: "someone@example.com" })).not.toHaveProperty("value.email");
  });

  it.each([
    ["fullName", { fullName: " " }, "Enter your name."],
    ["fullName", { fullName: "x".repeat(81) }, "Keep your name to 80 characters or fewer."],
    ["centreName", { centreName: "" }, "Enter your centre’s name."],
    ["centreName", { centreName: "x".repeat(101) }, "Keep the centre’s name to 100 characters or fewer."],
    ["city", { city: "" }, "Enter your city."],
    ["city", { city: "x".repeat(61) }, "Keep the city to 60 characters or fewer."],
    ["centreType", { centreType: "bakery" }, "Pick the type of centre."],
    ["centreType", { centreType: undefined }, "Pick the type of centre."],
    ["phone", { phone: "9".repeat(21) }, "Keep the mobile number to 20 characters or fewer."],
    ["acceptedTerms", { acceptedTerms: false }, "Accept the terms and privacy notice to continue."],
    ["acceptedTerms", { acceptedTerms: undefined }, "Accept the terms and privacy notice to continue."],
  ])("explains a bad %s", (field, change, message) => {
    const result = validateProfile({ ...valid, ...change });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields[field]).toBe(message);
  });

  it("names every field at fault at once", () => {
    const result = validateProfile({ fullName: "", phone: "", centreName: "", city: "", centreType: "bakery", acceptedTerms: false });
    expect(!result.ok && Object.keys(result.fields).sort()).toEqual(["acceptedTerms", "centreName", "centreType", "city", "fullName"]);
  });

  it.each([
    ["any spelling, unchecked", " +1 (555) 010-9999 ", "+1 (555) 010-9999"],
    ["left empty", "  ", null],
    ["left out", undefined, null],
  ])("takes the owner's mobile number %s: it's optional and never confirmed", (_case, phone, saved) => {
    expect(validateProfile({ ...valid, phone })).toMatchObject({ ok: true, value: { phone: saved } });
  });
});

describe("centre types", () => {
  it("lists the TSD's types with labels for the form", () => {
    expect(CENTRE_TYPES).toEqual(["tuition", "coaching", "dance", "music", "sports", "other"]);
    expect(CENTRE_TYPES.map((t) => CENTRE_TYPE_LABELS[t])).toEqual(["Tuition", "Coaching", "Dance", "Music", "Sports", "Other"]);
  });
});

describe("validateOwner", () => {
  it("accepts a trimmed name and mobile number", () => {
    expect(validateOwner({ fullName: "  Asha S. Sharma ", phone: " 98765 43210 " })).toEqual({
      ok: true,
      value: { fullName: "Asha S. Sharma", phone: "98765 43210" },
    });
    expect(validateOwner({ fullName: "Asha", phone: "" })).toEqual({ ok: true, value: { fullName: "Asha", phone: null } });
  });

  it("uses sign-up's messages", () => {
    expect(validateOwner({ fullName: " " })).toEqual({ ok: false, fields: { fullName: "Enter your name." } });
  });
});

describe("validateCentre", () => {
  it("accepts a centre's name, city and type", () => {
    expect(validateCentre({ centreName: " Sunrise Academy ", city: "Patna", centreType: "tuition" })).toEqual({
      ok: true,
      value: { centreName: "Sunrise Academy", city: "Patna", centreType: "tuition" },
    });
  });

  it("names every field at fault, with sign-up's messages", () => {
    const result = validateCentre({ centreName: "", city: "x".repeat(61), centreType: "bakery" });
    expect(result).toEqual({
      ok: false,
      fields: {
        centreName: "Enter your centre’s name.",
        city: "Keep the city to 60 characters or fewer.",
        centreType: "Pick the type of centre.",
      },
    });
  });
});
