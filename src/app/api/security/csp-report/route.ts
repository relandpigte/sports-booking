import type { NextRequest } from "next/server";

import { consumeRateLimit } from "@/lib/rate-limit";
import { securityContextFromHeaders } from "@/lib/security-context";

export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 16 * 1024;

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return value.slice(0, 500);
  }
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }
  const context = securityContextFromHeaders(request.headers);
  if (!(await consumeRateLimit({
    namespace: "csp-report",
    subject: context.ipHash,
    limit: 60,
    windowSeconds: 60 * 60,
  }))) {
    return new Response(null, { status: 204 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const report = (body["csp-report"] ?? body) as Record<string, unknown>;
    console.warn("CSP_REPORT", {
      documentUri: safeUrl(report["document-uri"] ?? report.documentURL),
      blockedUri: safeUrl(report["blocked-uri"] ?? report.blockedURL),
      effectiveDirective:
        typeof report["effective-directive"] === "string"
          ? report["effective-directive"].slice(0, 100)
          : null,
      sourceFile: safeUrl(report["source-file"] ?? report.sourceFile),
      disposition:
        typeof report.disposition === "string"
          ? report.disposition.slice(0, 30)
          : null,
    });
  } catch {
    // Malformed reports are intentionally ignored; never echo attacker input.
  }
  return new Response(null, { status: 204 });
}
