// Server-safe avatar helpers (no DOM). Validates the data URLs produced by
// `fileToAvatarDataUrl` before they're written to the database.

export const MAX_AVATAR_BYTES = 200 * 1024; // 200 KB
export const MAX_COVER_BYTES = 600 * 1024; // 600 KB
export const MAX_COVERS = 6;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

// Validates a base64 image data URL against a max decoded size.
export function isImageDataUrl(value: string, maxBytes: number): boolean {
  if (!DATA_URL_RE.test(value)) return false;
  const base64 = value.split(",")[1] ?? "";
  if (!base64) return false;
  // Approximate decoded byte size from base64 length.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  return bytes > 0 && bytes <= maxBytes;
}

export function isValidAvatar(value: string): boolean {
  return isImageDataUrl(value, MAX_AVATAR_BYTES);
}

// Normalizes a list of cover-photo data URLs (drops empties, validates each,
// caps the count).
export function normalizeCoverPhotos(raw: string[]): {
  values: string[];
  error?: string;
} {
  const items = raw.map((v) => (v ?? "").trim()).filter(Boolean);
  if (items.length > MAX_COVERS) {
    return { values: [], error: `You can add at most ${MAX_COVERS} cover photos.` };
  }
  for (const item of items) {
    // Allow http(s) URLs (future CDN) or validated data URLs.
    if (item.startsWith("http://") || item.startsWith("https://")) continue;
    if (!isImageDataUrl(item, MAX_COVER_BYTES)) {
      return { values: [], error: "A cover photo is invalid or larger than 600KB." };
    }
  }
  return { values: items };
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
