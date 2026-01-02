import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  compiler: {
    removeConsole: isProd ? { exclude: ["error"] } : false,
  },
  // in dev mode, SSG is disabled
  output: isProd ? "export" : undefined,
  staticPageGenerationTimeout: 10 * 60, // 10 minutes
};

export default nextConfig;
