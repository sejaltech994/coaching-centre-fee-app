import { describe, expect, it } from "vitest";
import { formatIndianMobile, maskPhone, normalizeIndianMobile } from "./phone";

describe("normalizeIndianMobile", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["(+91) 98765-43210", "+919876543210"],
    ["  6123456789  ", "+916123456789"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["12345", "too short"],
    ["98765432101", "11 digits without a country code"],
    ["5876543210", "starts with 5: not a mobile number"],
    ["0123456789", "landline-style leading 0 with 9 digits"],
    ["+1 415 555 0100", "not an Indian number"],
    ["+9198765432", "+91 with too few digits"],
    ["98765abcde", "letters"],
    ["9876543210 ext 2", "extra text"],
  ])("rejects %j (%s)", (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe("formatIndianMobile", () => {
  it("groups an E.164 number the way it is read aloud", () => {
    expect(formatIndianMobile("+919876543210")).toBe("+91 98765 43210");
  });

  it("returns anything else unchanged", () => {
    expect(formatIndianMobile("12345")).toBe("12345");
  });
});

describe("maskPhone", () => {
  it("keeps the country code and last four digits only", () => {
    expect(maskPhone("+919876543210")).toBe("+91******3210");
  });

  it("masks anything it does not recognise completely", () => {
    expect(maskPhone("not a phone")).toBe("***");
    expect(maskPhone("")).toBe("***");
  });
});
