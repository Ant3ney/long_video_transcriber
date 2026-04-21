import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads for video files (up to 10 GB)
  experimental: {
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
  // Opt out of static generation for API routes that use native modules
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

