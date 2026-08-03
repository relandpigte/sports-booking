import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";

export type SecurityRequestContext = {
  deviceHash: string;
  deviceLabel: string;
  browser: string | null;
  operatingSystem: string | null;
  location: string | null;
  ipHash: string;
  ipPrefix: string | null;
};

function digest(value: string): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "bunal-local-security-context";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function hashSecurityToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function ipPrefix(ip: string | null): string | null {
  if (!ip) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (ip.includes(":")) {
    if (ip === "::1") return null;
    const prefix = ip.split(":").filter(Boolean).slice(0, 4).join(":");
    return prefix ? `${prefix}::/64` : null;
  }
  return null;
}

function browserFromUserAgent(userAgent: string): string | null {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/CriOS|Chrome\//i.test(userAgent)) return "Chrome";
  if (/FxiOS|Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return userAgent ? "Browser" : null;
}

function osFromUserAgent(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return null;
}

export function securityContextFromHeaders(
  source: Pick<Headers, "get">
): SecurityRequestContext {
  const userAgent = source.get("user-agent")?.slice(0, 500) ?? "";
  const ip =
    firstHeaderValue(source.get("x-forwarded-for")) ??
    firstHeaderValue(source.get("cf-connecting-ip")) ??
    firstHeaderValue(source.get("x-real-ip")) ??
    "unknown";
  const browser = browserFromUserAgent(userAgent);
  const operatingSystem = osFromUserAgent(userAgent);
  const deviceLabel =
    [operatingSystem, browser].filter(Boolean).join(" · ") || "Unknown device";
  const city = source.get("x-vercel-ip-city")?.trim();
  const country =
    source.get("x-vercel-ip-country")?.trim() ||
    source.get("cf-ipcountry")?.trim();
  const location = [city, country].filter(Boolean).join(", ") || null;

  return {
    deviceHash: digest(`${userAgent}|${source.get("accept-language") ?? ""}`),
    deviceLabel,
    browser,
    operatingSystem,
    location,
    ipHash: digest(ip),
    ipPrefix: ipPrefix(ip === "unknown" ? null : ip),
  };
}

export async function getSecurityRequestContext(): Promise<SecurityRequestContext> {
  return securityContextFromHeaders(await headers());
}

export function loginThrottleKeys(email: string, ipHash: string): {
  accountIp: string;
  ip: string;
} {
  return {
    accountIp: digest(`account-ip:${email}:${ipHash}`),
    ip: digest(`ip:${ipHash}`),
  };
}
