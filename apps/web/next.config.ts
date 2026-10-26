import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export to ./out, served by Cloudflare Workers static assets.
  // The web app talks to apps/api over HTTP, so it needs no server of its own.
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
