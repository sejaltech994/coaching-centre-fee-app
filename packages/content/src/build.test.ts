import { describe, expect, it, vi } from "vitest";
import { loadCopyForBuild } from "./build";
import { CATALOG, defaultCopy } from "./copy";

const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

describe("loadCopyForBuild", () => {
  it("uses the built-in text when no CMS is configured, and says so", async () => {
    const log = vi.fn();
    const fetch = respond({ result: [] });

    expect(await loadCopyForBuild({}, { fetch, log })).toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Copy: SANITY_PROJECT_ID is not set, using the built-in text.");
  });

  it("returns the CMS text merged over the built-in text, as JSON for the bundle", async () => {
    const log = vi.fn();
    const fetch = respond({ result: [{ _type: "copy_auth", welcomeTitle: "Namaste! Welcome to Chukta" }] });

    const json = await loadCopyForBuild({ SANITY_PROJECT_ID: "abc123" }, { fetch, log });

    expect(JSON.parse(json!)).toEqual({
      ...defaultCopy(CATALOG),
      auth: { ...defaultCopy(CATALOG).auth, welcomeTitle: "Namaste! Welcome to Chukta" },
    });
    expect(log).toHaveBeenCalledWith("Copy: read published text from Sanity project abc123 (production).");
  });

  it("reports entries the CMS got wrong, as GitHub warnings on CI", async () => {
    const log = vi.fn();
    const fetch = respond({ result: [{ _type: "copy_errors", invalidOtp: "Wrong code." }] });

    await loadCopyForBuild({ SANITY_PROJECT_ID: "abc123", GITHUB_ACTIONS: "true" }, { fetch, log });

    expect(log).toHaveBeenCalledWith(
      "::warning title=CMS copy::errors.invalidOtp: must include {tries} (using the built-in text)",
    );
  });

  it("fails the build when the CMS is configured but can't be read, so the live site keeps its last good text", async () => {
    await expect(
      loadCopyForBuild({ SANITY_PROJECT_ID: "abc123" }, { fetch: respond({}, 503), log: vi.fn() }),
    ).rejects.toThrow("Couldn't read copy from Sanity: Sanity answered 503");
  });
});
