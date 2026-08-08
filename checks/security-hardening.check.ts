// Static security baseline: dependency-facing configuration, browser headers,
// password policy, MFA policy, and server-side raster decoding.
//
//   npm run check:security
import nextConfig from "../next.config";

import { ok, report } from "./harness";
import { sanitizeImageDataUrl } from "@/lib/avatar";
import { roleRequiresMfa } from "@/lib/mfa-policy";
import { RegisterSchema } from "@/lib/validation";

const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";

async function check() {
  const previousCutover = process.env.PARTNER_MFA_REQUIRED_AFTER;
  process.env.PARTNER_MFA_REQUIRED_AFTER = "2000-01-01T00:00:00.000Z";
  ok(
    "administrators and partners require MFA after the cutover",
    roleRequiresMfa("ADMIN") && roleRequiresMfa("PARTNER") && !roleRequiresMfa("PLAYER")
  );
  if (previousCutover === undefined) delete process.env.PARTNER_MFA_REQUIRED_AFTER;
  else process.env.PARTNER_MFA_REQUIRED_AFTER = previousCutover;

  ok(
    "short and bcrypt-truncated new passwords are rejected",
    !RegisterSchema.safeParse({
      email: "security@example.test",
      password: "short-password",
      confirmPassword: "short-password",
    }).success &&
      !RegisterSchema.safeParse({
        email: "security@example.test",
        password: "x".repeat(65),
        confirmPassword: "x".repeat(65),
      }).success
  );

  const normalized = await sanitizeImageDataUrl(VALID_PNG_DATA_URL, "receipt");
  ok(
    "valid raster uploads are decoded and re-encoded",
    normalized?.startsWith("data:image/webp;base64,") === true
  );
  ok(
    "spoofed image data URLs are rejected",
    (await sanitizeImageDataUrl("data:image/png;base64,YQ==", "receipt")) === null
  );

  const configuredHeaders =
    typeof nextConfig.headers === "function" ? await nextConfig.headers() : [];
  const globalHeaders = configuredHeaders.find((entry) => entry.source === "/:path*");
  const names = new Set(globalHeaders?.headers.map((header) => header.key));
  ok(
    "global browser security headers and CSP reporting are configured",
    nextConfig.poweredByHeader === false &&
      names.has("X-Content-Type-Options") &&
      names.has("X-Frame-Options") &&
      names.has("Referrer-Policy") &&
      names.has("Permissions-Policy") &&
      names.has("Content-Security-Policy-Report-Only")
  );
}

void check().finally(report);
