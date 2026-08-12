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
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Allow dev assets and HMR through the public HTTPS tunnel configured for
  // payment redirects and PayMongo webhooks.
  allowedDevOrigins: appHostname(),
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(self), browsing-topics=(), interest-cohort=()",
      },
      {
        key: "Content-Security-Policy-Report-Only",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' https://*.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://vitals.vercel-insights.com https://*.vercel-insights.com https://*.ably.io wss://*.ably.io https://*.ably-realtime.com wss://*.ably-realtime.com https://*.ably.net wss://*.ably.net",
          "frame-src https://www.googletagmanager.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "report-uri /api/security/csp-report",
        ].join("; "),
      },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
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
