import { afterEach, describe, expect, it } from "vitest";
import { loginUrl, rememberReturn, safePath, takeReturn } from "./returnTo";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("loginUrl", () => {
  it("says why, and where to come back to", () => {
    window.history.replaceState(null, "", "/students/edit/?id=s1");
    expect(loginUrl("expired")).toBe("/login/?session=expired&next=%2Fstudents%2Fedit%2F%3Fid%3Ds1");
  });

  it("leaves out the dashboard and the home page: sign-in lands there anyway", () => {
    for (const path of ["/", "/dashboard/"]) {
      window.history.replaceState(null, "", path);
      expect(loginUrl("required")).toBe("/login/?session=required");
    }
  });
});

describe("safePath", () => {
  it.each(["/students/", "/fees/?status=paid"])("keeps a path inside the app: %s", (path) => {
    expect(safePath(path)).toBe(path);
  });

  it.each([null, "", "https://evil.example/", "//evil.example/", "/\\evil.example", "javascript:alert(1)", "/login/?x=1", "students"])(
    "refuses anything else: %s",
    (path) => {
      expect(safePath(path)).toBeNull();
    },
  );
});

describe("rememberReturn / takeReturn", () => {
  it("keeps a safe path through the Google round trip, once", () => {
    rememberReturn("/fees/");
    expect(takeReturn()).toBe("/fees/");
    expect(takeReturn()).toBeNull();
  });

  it("ignores an unsafe one", () => {
    rememberReturn("https://evil.example/");
    expect(takeReturn()).toBeNull();
  });
});
