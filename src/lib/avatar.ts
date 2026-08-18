// Server-side image validation and normalization. Browser-generated data URLs
// are untrusted input: every raster is decoded by libvips, bounded by pixels,
// and re-encoded before it is stored.

import "server-only";

import sharp from "sharp";

import {
  MAX_AVATAR_BYTES,
  MAX_COVER_BYTES,
  MAX_COVERS,
  MAX_QR_BYTES,
  MAX_RECEIPT_BYTES,
} from "@/lib/image-constants";

export {
  MAX_AVATAR_BYTES,
  MAX_COVER_BYTES,
  MAX_COVERS,
  MAX_QR_BYTES,
  MAX_RECEIPT_BYTES,
} from "@/lib/image-constants";

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;
const IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);

type ImageKind = "avatar" | "cover" | "receipt" | "qr";

const IMAGE_LIMITS: Record<
  ImageKind,
  { maxInputBytes: number; maxOutputBytes: number; maxWidth: number; maxHeight: number }
> = {
  avatar: {
    maxInputBytes: MAX_AVATAR_BYTES,
    maxOutputBytes: MAX_AVATAR_BYTES,
    maxWidth: 512,
    maxHeight: 512,
  },
  cover: {
    maxInputBytes: MAX_COVER_BYTES,
    maxOutputBytes: MAX_COVER_BYTES,
    maxWidth: 1600,
    maxHeight: 1200,
  },
  receipt: {
    maxInputBytes: MAX_RECEIPT_BYTES,
    maxOutputBytes: MAX_RECEIPT_BYTES,
    maxWidth: 2000,
    maxHeight: 2000,
  },
  qr: {
    maxInputBytes: MAX_QR_BYTES,
    maxOutputBytes: MAX_QR_BYTES,
    maxWidth: 1600,
    maxHeight: 1600,
  },
};

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

export async function sanitizeImageDataUrl(
  value: string,
  kind: ImageKind
): Promise<string | null> {
  const match = DATA_URL_RE.exec(value);
  if (!match) return null;
  const base64 = value.slice(match[0].length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

  const limits = IMAGE_LIMITS[kind];
  const input = Buffer.from(base64, "base64");
  if (input.length === 0 || input.length > limits.maxInputBytes) return null;

  try {
    const image = sharp(input, {
      failOn: "warning",
      limitInputPixels: limits.maxWidth * limits.maxHeight,
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !IMAGE_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > limits.maxWidth ||
      metadata.height > limits.maxHeight
    ) {
      return null;
    }

    const output = await image
      .rotate()
      .webp({ quality: kind === "qr" ? 95 : 82, lossless: kind === "qr" })
      .toBuffer();
    if (output.length === 0 || output.length > limits.maxOutputBytes) return null;
    return `data:image/webp;base64,${output.toString("base64")}`;
  } catch {
    return null;
  }
}

export function isValidAvatar(value: string): boolean {
  return isImageDataUrl(value, MAX_AVATAR_BYTES);
}

// Normalizes a list of cover-photo data URLs (drops empties, validates each,
// caps the count).
export async function normalizeCoverPhotos(raw: string[]): Promise<{
  values: string[];
  error?: string;
}> {
  const items = raw.map((v) => (v ?? "").trim()).filter(Boolean);
  if (items.length > MAX_COVERS) {
    return { values: [], error: `You can add at most ${MAX_COVERS} cover photos.` };
  }
  const values: string[] = [];
  for (const item of items) {
    if (item.startsWith("https://")) {
      values.push(item);
      continue;
    }
    const sanitized = await sanitizeImageDataUrl(item, "cover");
    if (!sanitized) {
      return { values: [], error: "A cover photo is invalid or larger than 600KB." };
    }
    values.push(sanitized);
  }
  return { values };
}

// Normalizes a submitted avatar value into what should be stored:
// - empty  -> null (cleared / not set)
// - data:  -> validated data URL, or an error
// - http   -> passed through (e.g. a future CDN/Blob URL)
export async function normalizeAvatar(raw: string | null | undefined): Promise<{
  value: string | null;
  error?: string;
}> {
  const v = (raw ?? "").trim();
  if (!v) return { value: null };

  if (v.startsWith("data:")) {
    const sanitized = await sanitizeImageDataUrl(v, "avatar");
    return sanitized
      ? { value: sanitized }
      : { value: null, error: "Image is invalid or larger than 200KB." };
  }

  if (v.startsWith("https://")) {
    return { value: v };
  }

  return { value: null, error: "Unsupported image." };
}
