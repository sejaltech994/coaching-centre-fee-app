import { describe, expect, it, vi } from "vitest";
import type { Catalog } from "./copy";
import { fetchCopyFromSanity, sanityConfigFrom, studioDocumentTypes } from "./sanity";

const catalog = {
  auth: {
    title: "Sign up and login",
    entries: {
      welcomeTitle: { label: "Welcome: heading", text: "Welcome to Chukta" },
      wrongCode: { label: "Wrong code", text: "That code didn’t match. {tries} tries left.", multiline: true },
    },
  },
} satisfies Catalog;

const config = { projectId: "abc123", dataset: "production", perspective: "published" as const };

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("fetchCopyFromSanity", () => {
  it("reads every area's document in one query from the CDN and returns plain text by area", async () => {
    const fetch = respond({
      result: [{ _id: "copy_auth", _type: "copy_auth", _rev: "r1", _updatedAt: "2026-10-27", welcomeTitle: "Namaste!" }],
    });

    const raw = await fetchCopyFromSanity(config, catalog, fetch);

    expect(raw).toEqual({ auth: { welcomeTitle: "Namaste!" } });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.origin).toBe("https://abc123.apicdn.sanity.io");
    expect(url.pathname).toMatch(/^\/v\d{4}-\d{2}-\d{2}\/data\/query\/production$/);
    expect(url.searchParams.get("perspective")).toBe("published");
    expect(JSON.parse(url.searchParams.get("$types")!)).toEqual(["copy_auth"]);
  });

  it("reads drafts from the live API with the token, for dev, sit and uat", async () => {
    const fetch = respond({ result: [] });

    await fetchCopyFromSanity({ ...config, perspective: "drafts", token: "sk-read" }, catalog, fetch);

    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).origin).toBe("https://abc123.api.sanity.io");
    expect(new URL(String(url)).searchParams.get("perspective")).toBe("drafts");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-read");
  });

  it("sends the token for published text too, since the dataset is private, still via the CDN", async () => {
    const fetch = respond({ result: [] });

    await fetchCopyFromSanity({ ...config, token: "sk-read" }, catalog, fetch);

    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).origin).toBe("https://abc123.apicdn.sanity.io");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-read");
  });

  it("fails loudly when Sanity can't be read", async () => {
    await expect(fetchCopyFromSanity(config, catalog, respond({ error: "nope" }, 401))).rejects.toThrow(
      "Sanity answered 401",
    );
  });
});

describe("sanityConfigFrom", () => {
  it("is off when no project is configured, so local builds use the built-in text", () => {
    expect(sanityConfigFrom({})).toBeNull();
  });

  it("reads published text unless drafts are asked for", () => {
    expect(sanityConfigFrom({ SANITY_PROJECT_ID: "abc123", SANITY_READ_TOKEN: "sk" })).toEqual({
      projectId: "abc123",
      dataset: "production",
      perspective: "published",
      token: "sk",
    });
    expect(
      sanityConfigFrom({ SANITY_PROJECT_ID: "abc123", SANITY_PERSPECTIVE: "drafts", SANITY_READ_TOKEN: "sk", SANITY_DATASET: "copy" }),
    ).toEqual({ projectId: "abc123", dataset: "copy", perspective: "drafts", token: "sk" });
  });

  it("refuses to run without a token, since the dataset is private and would read as empty", () => {
    expect(() => sanityConfigFrom({ SANITY_PROJECT_ID: "abc123" })).toThrow("SANITY_READ_TOKEN");
    expect(() => sanityConfigFrom({ SANITY_PROJECT_ID: "abc123", SANITY_PERSPECTIVE: "drafts" })).toThrow(
      "SANITY_READ_TOKEN",
    );
  });
});

describe("studioDocumentTypes", () => {
  it("makes one document per area with a field per entry, pre-filled with the built-in text", () => {
    const [doc] = studioDocumentTypes(catalog);

    expect(doc).toMatchObject({ name: "copy_auth", type: "document", title: "Sign up and login" });
    expect(doc!.fields.map((f) => [f.name, f.type, f.title, f.initialValue])).toEqual([
      ["welcomeTitle", "string", "Welcome: heading", "Welcome to Chukta"],
      ["wrongCode", "text", "Wrong code", "That code didn’t match. {tries} tries left."],
    ]);
    expect(doc!.fields[1]!.description).toContain("{tries}");
  });

  it("validates edits the same way the build does", () => {
    const [doc] = studioDocumentTypes(catalog);
    const custom = vi.fn();
    const rule = { required: () => rule, custom: (fn: (value: unknown) => unknown) => (custom.mockImplementation(fn), rule) };

    doc!.fields[1]!.validation(rule);

    expect(custom("Galat code.")).toBe("must include {tries}");
    expect(custom("{tries} baaki.")).toBe(true);
    expect(custom(undefined)).toBe(true);
  });
});
