export const SITE_NAME = "Bunal.club";
// Vercel serves the production site from www and permanently redirects the
// apex domain there. Search metadata must use the final, non-redirecting host.
export const SITE_URL = "https://www.bunal.club";
export const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/opengraph-image`;

export const SITE_DESCRIPTION =
  "Find and book pickleball, badminton, volleyball, and tennis courts across Bohol. Check live availability and pay securely online.";

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

export function isPublicHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function conciseDescription(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const shortened = normalized.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : undefined)}…`;
}
