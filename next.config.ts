import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These limits help local/self-hosted Node runtimes. Vercel Functions still
  // enforce their platform request-body cap, so deployed large uploads use
  // browser-to-Blob multipart uploads instead of posting files through /api/jobs.
  experimental: {
    serverActions: {
      bodySizeLimit: "20gb",
    },
    proxyClientMaxBodySize: "20gb",
  },
  // Opt out of static generation for API routes that use native modules
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
