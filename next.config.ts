import type { NextConfig } from "next";

function appHostname(): string[] {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return [];

  try {
    return [new URL(appUrl).hostname];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Allow dev assets and HMR through the public HTTPS tunnel configured for
  // payment redirects and PayMongo webhooks.
  allowedDevOrigins: appHostname(),
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
