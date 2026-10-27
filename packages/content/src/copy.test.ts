import { describe, expect, it } from "vitest";
import { CATALOG, checkEntry, defaultCopy, fill, placeholdersIn, resolveCopy, type Catalog } from "./copy";

const catalog = {
  auth: {
    title: "Sign up and login",
    entries: {
      welcomeTitle: { label: "Welcome: heading", text: "Welcome to Chukta" },
      wrongCode: { label: "Wrong code", text: "That code didn’t match. {tries} tries left." },
    },
  },
} satisfies Catalog;

describe("resolveCopy", () => {
  it("uses the built-in text when the CMS has nothing", () => {
    expect(resolveCopy(undefined, catalog)).toEqual({
      copy: { auth: { welcomeTitle: "Welcome to Chukta", wrongCode: "That code didn’t match. {tries} tries left." } },
      problems: [],
    });
  });

  it("uses the CMS text, trimmed, where it is given", () => {
    const { copy, problems } = resolveCopy({ auth: { welcomeTitle: "  Namaste! Welcome to Chukta " } }, catalog);
    expect(copy.auth.welcomeTitle).toBe("Namaste! Welcome to Chukta");
    expect(copy.auth.wrongCode).toBe("That code didn’t match. {tries} tries left.");
    expect(problems).toEqual([]);
  });

  it("keeps the built-in text when an edit drops a placeholder, and says why", () => {
    const { copy, problems } = resolveCopy({ auth: { wrongCode: "Wrong code, try again." } }, catalog);
    expect(copy.auth.wrongCode).toBe("That code didn’t match. {tries} tries left.");
    expect(problems).toEqual(["auth.wrongCode: must include {tries}"]);
  });

  it("keeps the built-in text when an edit adds a placeholder the app can't fill", () => {
    const { copy, problems } = resolveCopy({ auth: { welcomeTitle: "Welcome, {name}" } }, catalog);
    expect(copy.auth.welcomeTitle).toBe("Welcome to Chukta");
    expect(problems).toEqual(["auth.welcomeTitle: {name} can't be filled in here"]);
  });

  it("ignores blank and non-text values, and reports entries the app doesn't know", () => {
    const { copy, problems } = resolveCopy(
      { auth: { welcomeTitle: "   ", wrongCode: 42, retired: "Old text" }, billing: { title: "Bills" } },
      catalog,
    );
    expect(copy).toEqual(defaultCopy(catalog));
    expect(problems).toEqual(["auth.wrongCode: not text", "auth.retired: not used by the app", "billing: not used by the app"]);
  });
});

describe("checkEntry", () => {
  it("accepts text with exactly the entry's placeholders", () => {
    expect(checkEntry(catalog.auth.entries.wrongCode, "Galat code. {tries} baaki.")).toBe(true);
  });

  it("explains a missing or extra placeholder, for the editor", () => {
    expect(checkEntry(catalog.auth.entries.wrongCode, "Galat code.")).toBe("must include {tries}");
    expect(checkEntry(catalog.auth.entries.welcomeTitle, "Hi {name}")).toBe("{name} can't be filled in here");
  });
});

describe("fill", () => {
  it("fills placeholders, leaving unknown ones visible", () => {
    expect(fill("That code didn’t match. {tries} tries left.", { tries: 4 })).toBe("That code didn’t match. 4 tries left.");
    expect(fill("Sent to {phone}. {other}", { phone: "+91 98765 43210" })).toBe("Sent to +91 98765 43210. {other}");
  });
});

describe("the app's catalog", () => {
  it("gives every entry a label for editors and non-empty text", () => {
    for (const area of Object.values(CATALOG)) {
      expect(area.title).not.toBe("");
      for (const entry of Object.values(area.entries)) {
        expect(entry.label).not.toBe("");
        expect(entry.text.trim()).not.toBe("");
      }
    }
  });

  it("uses only names Sanity accepts for areas and entries", () => {
    for (const [area, { entries }] of Object.entries(CATALOG)) {
      expect(area).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      for (const key of Object.keys(entries)) expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it("lists placeholders in the order they appear", () => {
    expect(placeholdersIn("{a} and {b}, then {a}")).toEqual(["a", "b"]);
  });
});
