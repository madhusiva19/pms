import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [];
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
