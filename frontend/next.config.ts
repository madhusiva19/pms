import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [];
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;