import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller runtime footprint — important on Render free tier (512 MB).
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [
      { source: "/portfolio", destination: "/", permanent: false },
      { source: "/onboarding", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
