// Server-safe avatar helpers (no DOM). Validates the data URLs produced by
// `fileToAvatarDataUrl` before they're written to the database.

export const MAX_AVATAR_BYTES = 200 * 1024; // 200 KB

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

export function isValidAvatar(value: string): boolean {
  if (!DATA_URL_RE.test(value)) return false;
  const base64 = value.split(",")[1] ?? "";
  if (!base64) return false;
  // Approximate decoded byte size from base64 length.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  return bytes > 0 && bytes <= MAX_AVATAR_BYTES;
}

// Normalizes a submitted avatar value into what should be stored:
// - empty  -> null (cleared / not set)
// - data:  -> validated data URL, or an error
// - http   -> passed through (e.g. a future CDN/Blob URL)
export function normalizeAvatar(raw: string | null | undefined): {
  value: string | null;
  error?: string;
} {
  const v = (raw ?? "").trim();
  if (!v) return { value: null };

  if (v.startsWith("data:")) {
    return isValidAvatar(v)
      ? { value: v }
      : { value: null, error: "Image is invalid or larger than 200KB." };
  }

  if (v.startsWith("http://") || v.startsWith("https://")) {
    return { value: v };
  }

  return { value: null, error: "Unsupported image." };
}
