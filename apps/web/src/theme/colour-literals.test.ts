// @vitest-environment node
import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: path.resolve(__dirname, "../..") });
const rulesBroken = async (code: string, filePath: string) =>
  (await eslint.lintText(code, { filePath }))[0].messages.map((m) => m.ruleId);

describe("colours live only in src/theme", () => {
  it.each([
    ['export const c = "#2B2F77";', "a hex value"],
    ['export const s = { color: "rgb(43, 47, 119)" };', "an rgb() value"],
    ["export const s = `1px solid #E6DCC8`;", "a hex value in a template"],
  ])("rejects %s in a screen (%s)", async (code) => {
    expect(await rulesBroken(code, "src/components/Example.tsx")).toContain("no-restricted-syntax");
  });

  it("allows them in the theme folder", async () => {
    expect(await rulesBroken('export const c = "#2B2F77";', "src/theme/tokens.ts")).toEqual([]);
  });

  it("allows colours by name", async () => {
    expect(await rulesBroken('export const s = { color: "text.secondary", href: "#main" };', "src/components/Example.tsx")).toEqual([]);
  });
}, 60_000);
