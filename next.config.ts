import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep unrelated lockfiles in parent folders outside this app's build root.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
