import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep unrelated lockfiles in parent folders outside this app's build root.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
