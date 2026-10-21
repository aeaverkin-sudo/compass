import type { NextConfig } from "next";

/** Changes on every Render deploy, so the service worker drops the previous shell. */
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || process.env.RENDER_GIT_COMMIT || "dev";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  // Smaller runtime footprint — important on Render free tier (512 MB).
  output: "standalone",
  // The poster snapshot unpacks Chromium from these archives at run time; the trace cannot see them.
  outputFileTracingIncludes: {
    "/api/events": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/events/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [
      { source: "/portfolio", destination: "/main", permanent: false },
      { source: "/onboarding", destination: "/", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/@:handle", destination: "/c/h/:handle" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:dir(fonts|icons|brand)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000" }],
      },
      {
        // Stored files (/f/…) and the event preview image set their own caching.
        source: "/((?!_next/static|f/|fonts/|icons/|brand/|e/.+/opengraph-image$).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
