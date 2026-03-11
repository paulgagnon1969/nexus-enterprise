import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Provide a Turbopack config object so next-intl can register its aliases
  // correctly when using the Turbopack dev server.
  turbopack: {},
  async redirects() {
    return [
      {
        // Redirect any request coming to the old Vercel host over to the NCC
        // domain, preserving the path.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "nexus-enterprise-web.vercel.app",
          },
        ],
        destination: "https://ncc.nfsgrp.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
