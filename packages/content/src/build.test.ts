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
    const fetch = respond({ result: [{ _type: "copy_auth", signInTitle: "Namaste! Sign in" }] });

    const json = await loadCopyForBuild({ SANITY_PROJECT_ID: "abc123", SANITY_READ_TOKEN: "sk" }, { fetch, log });

    expect(JSON.parse(json!)).toEqual({
      ...defaultCopy(CATALOG),
      auth: { ...defaultCopy(CATALOG).auth, signInTitle: "Namaste! Sign in" },
    });
    expect(log).toHaveBeenCalledWith("Copy: read published text from Sanity project abc123 (production).");
  });

  it("reports entries the CMS got wrong, as GitHub warnings on CI", async () => {
    const log = vi.fn();
    const fetch = respond({ result: [{ _type: "copy_profile", lead: "Welcome." }] });

    await loadCopyForBuild({ SANITY_PROJECT_ID: "abc123", SANITY_READ_TOKEN: "sk", GITHUB_ACTIONS: "true" }, { fetch, log });

    expect(log).toHaveBeenCalledWith(
      "::warning title=CMS copy::profile.lead: must include {email} (using the built-in text)",
    );
  });

  it("fails the build when the CMS is configured but can't be read, so the live site keeps its last good text", async () => {
    await expect(
      loadCopyForBuild({ SANITY_PROJECT_ID: "abc123", SANITY_READ_TOKEN: "sk" }, { fetch: respond({}, 503), log: vi.fn() }),
    ).rejects.toThrow("Couldn't read copy from Sanity: Sanity answered 503");
  });

  // Workflow logs are admin-only; annotations show on the run page to anyone.
  it("reports why the CMS couldn't be read as a GitHub error on CI", async () => {
    const log = vi.fn();
    const env = { SANITY_PROJECT_ID: "abc123", SANITY_READ_TOKEN: "sk", GITHUB_ACTIONS: "true" };

    await expect(loadCopyForBuild(env, { fetch: respond({}, 401), log })).rejects.toThrow();

    expect(log).toHaveBeenCalledWith(
      "::error title=CMS copy::Couldn't read copy from Sanity: Sanity answered 401 for project abc123",
    );
  });

  it("reports a missing read token as a GitHub error on CI", async () => {
    const log = vi.fn();

    await expect(
      loadCopyForBuild({ SANITY_PROJECT_ID: "abc123", GITHUB_ACTIONS: "true" }, { fetch: respond({ result: [] }), log }),
    ).rejects.toThrow("SANITY_READ_TOKEN is not");

    expect(log).toHaveBeenCalledWith(
      "::error title=CMS copy::SANITY_PROJECT_ID is set but SANITY_READ_TOKEN is not: the dataset is private.",
    );
  });

  it("keeps errors out of annotation syntax off CI", async () => {
    const log = vi.fn();

    await expect(loadCopyForBuild({ SANITY_PROJECT_ID: "abc123" }, { log })).rejects.toThrow();

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("::error"));
  });
});
