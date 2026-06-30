import type { NextConfig } from "next";

const routeAliases: Record<string, string[]> = {
  '/my-team': ['/dashboard', '/myteam', '/my_team', '/my%20team'],
  '/members': ['/member'],
  '/approvals': ['/approval'],
  '/rejection': ['/reject', '/rejections'],
  '/status-tracking': ['/statustracking', '/status_tracking', '/status', '/tracking'],
  '/enquiry': ['/enquiries', '/inquiry', '/inquiries'],
  '/notifications': ['/notification'],
  '/test-connection': ['/testconnection', '/test_connection'],
};

const nextConfig: NextConfig = {
  async redirects() {
    return Object.entries(routeAliases).flatMap(([destination, aliases]) =>
      aliases.flatMap((source) => [
        {
          source,
          destination,
          permanent: false,
        },
        {
          source: `${source}/:path*`,
          destination: `${destination}/:path*`,
          permanent: false,
        },
      ])
    );
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;