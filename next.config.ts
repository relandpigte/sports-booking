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
};

export default nextConfig;
