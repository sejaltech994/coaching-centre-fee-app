import { loadCopyForBuild } from "@chukta/content/build";
import type { NextConfig } from "next";

export default async function config(): Promise<NextConfig> {
  // App text from the CMS (Sanity), baked into the bundle at build time.
  // Without SANITY_PROJECT_ID the built-in text is used.
  const copy = await loadCopyForBuild(process.env);

  return {
    reactStrictMode: true,
    // Static export to ./out, served by Cloudflare Workers static assets.
    // The web app talks to apps/api over HTTP, so it needs no server of its own.
    output: "export",
    trailingSlash: true,
    // Workspace packages ship TypeScript source.
    transpilePackages: ["@chukta/shared", "@chukta/content"],
    env: copy ? { CHUKTA_COPY: copy } : {},
  };
}
