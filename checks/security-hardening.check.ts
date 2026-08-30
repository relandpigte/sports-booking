// Static security baseline: dependency-facing configuration, browser headers,
// password policy, MFA policy, and server-side raster decoding.
//
//   npm run check:security
import nextConfig from "../next.config";

import { assertNotProduction, ok, report } from "./harness";
import { sanitizeImageDataUrl } from "@/lib/avatar";
import { roleRequiresMfa } from "@/lib/mfa-policy";
import { RegisterSchema } from "@/lib/validation";

const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";

async function check() {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousCheckDatabaseUrl = process.env.CHECK_DATABASE_URL;

  try {
    process.env.DATABASE_URL = "postgresql://localhost/bunal_check";
    delete process.env.CHECK_DATABASE_URL;
    let missingConfirmationRejected = false;
    try {
      assertNotProduction();
    } catch {
      missingConfirmationRejected = true;
    }
    ok(
      "database checks reject a target without explicit confirmation",
      missingConfirmationRejected
    );

    process.env.CHECK_DATABASE_URL = "postgresql://localhost/another_database";
    let mismatchedConfirmationRejected = false;
    try {
      assertNotProduction();
    } catch {
      mismatchedConfirmationRejected = true;
    }
    ok(
      "database checks reject mismatched confirmation",
      mismatchedConfirmationRejected
    );

    process.env.CHECK_DATABASE_URL = process.env.DATABASE_URL;
    let confirmedTargetAccepted = true;
    try {
      assertNotProduction();
    } catch {
      confirmedTargetAccepted = false;
    }
    ok(
      "database checks accept an explicitly confirmed non-production target",
      confirmedTargetAccepted
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousCheckDatabaseUrl === undefined) delete process.env.CHECK_DATABASE_URL;
    else process.env.CHECK_DATABASE_URL = previousCheckDatabaseUrl;
  }

  const previousCutover = process.env.PARTNER_MFA_REQUIRED_AFTER;
  delete process.env.PARTNER_MFA_REQUIRED_AFTER;
  ok(
    "partner MFA remains optional without a valid cutover",
    roleRequiresMfa("ADMIN") &&
      !roleRequiresMfa("PARTNER") &&
      !roleRequiresMfa("PLAYER")
  );

  process.env.PARTNER_MFA_REQUIRED_AFTER = "not-a-date";
  ok(
    "an invalid partner MFA cutover fails open for partner onboarding",
    !roleRequiresMfa("PARTNER")
  );

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
    }).success &&
      !RegisterSchema.safeParse({
        email: "security@example.test",
        password: "x".repeat(65),
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
  const reportOnlyPolicy = globalHeaders?.headers.find(
    (header) => header.key === "Content-Security-Policy-Report-Only"
  )?.value;
  ok(
    "global browser security headers and intentional third-party CSP sources are configured",
    nextConfig.poweredByHeader === false &&
      names.has("X-Content-Type-Options") &&
      names.has("X-Frame-Options") &&
      names.has("Referrer-Policy") &&
      names.has("Permissions-Policy") &&
      names.has("Content-Security-Policy-Report-Only") &&
      reportOnlyPolicy?.includes("https://connect.facebook.net") === true &&
      reportOnlyPolicy.includes("form-action 'self' https://www.facebook.com")
  );
}

void check().finally(report);
