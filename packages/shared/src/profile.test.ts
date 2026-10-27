import { describe, expect, it } from "vitest";
import { CENTRE_TYPE_LABELS, CENTRE_TYPES, validateProfile } from "./profile";

const valid = {
  fullName: "Asha Sharma",
  centreName: "Sunrise Classes",
  city: "Pune",
  centreType: "coaching",
  acceptedTerms: true,
};

describe("validateProfile", () => {
  it("accepts a complete profile, trimming text and treating a missing email as none", () => {
    const result = validateProfile({ ...valid, fullName: "  Asha Sharma ", centreName: " Sunrise Classes ", city: " Pune " });

    expect(result).toEqual({
      ok: true,
      value: { fullName: "Asha Sharma", centreName: "Sunrise Classes", city: "Pune", centreType: "coaching", email: null },
    });
  });

  it("lower-cases the email and treats a blank one as none", () => {
    expect(validateProfile({ ...valid, email: " Asha@Example.COM " })).toMatchObject({ value: { email: "asha@example.com" } });
    expect(validateProfile({ ...valid, email: "  " })).toMatchObject({ ok: true, value: { email: null } });
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
    ["email", { email: "not-an-email" }, "Enter a valid email address."],
    ["acceptedTerms", { acceptedTerms: false }, "Accept the terms and privacy notice to continue."],
    ["acceptedTerms", { acceptedTerms: undefined }, "Accept the terms and privacy notice to continue."],
  ])("explains a bad %s", (field, change, message) => {
    const result = validateProfile({ ...valid, ...change });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fields[field]).toBe(message);
  });

  it("names every field at fault at once", () => {
    const result = validateProfile({ fullName: "", centreName: "", city: "", centreType: "bakery", acceptedTerms: false });
    expect(!result.ok && Object.keys(result.fields).sort()).toEqual(
      ["acceptedTerms", "centreName", "centreType", "city", "fullName"],
    );
  });
});

describe("centre types", () => {
  it("lists the TSD's types with labels for the form", () => {
    expect(CENTRE_TYPES).toEqual(["tuition", "coaching", "dance", "music", "sports", "other"]);
    expect(CENTRE_TYPES.map((t) => CENTRE_TYPE_LABELS[t])).toEqual(["Tuition", "Coaching", "Dance", "Music", "Sports", "Other"]);
  });
});
