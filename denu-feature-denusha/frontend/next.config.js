/** @type {import('next').NextConfig} */
const routeAliases = {
  '/my-team': ['/dashboard', '/myteam', '/my_team', '/my%20team'],
  '/members': ['/member'],
  '/approvals': ['/approval'],
  '/rejection': ['/reject', '/rejections'],
  '/status-tracking': ['/statustracking', '/status_tracking', '/status', '/tracking'],
  '/enquiry': ['/enquiries', '/inquiry', '/inquiries'],
  '/notifications': ['/notification'],
  '/test-connection': ['/testconnection', '/test_connection'],
};

const nextConfig = {
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
};

module.exports = nextConfig;
