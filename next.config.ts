import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller runtime footprint — important on Render free tier (512 MB).
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [
      { source: "/portfolio", destination: "/main", permanent: false },
      { source: "/onboarding", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/((?!_next/static).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
