import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the shared packages ship TypeScript source
  transpilePackages: ["@linkedin-sync/core", "@linkedin-sync/ui"],
};

export default nextConfig;
