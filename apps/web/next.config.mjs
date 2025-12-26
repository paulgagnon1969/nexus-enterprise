/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        destination: "https://ncc-nexus-contractor-connect.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
