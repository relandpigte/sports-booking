// Client-only helper: load an image file, cover-crop it to a square, and
// return a small data URL suitable for storing directly in the database.

export async function fileToAvatarDataUrl(
  file: File,
  size = 256,
  quality = 0.85
): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // Cover-crop: scale so the image fills the square, centered.
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);

    // Prefer WebP (smaller); fall back to JPEG where unsupported.
    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) {
      url = canvas.toDataURL("image/jpeg", quality);
    }
    return url;
  } finally {
    bitmap.close();
  }
}

// Resize a wide cover image: scale down to a max width/height, preserving
// aspect ratio. Returns a small-ish data URL (WebP, JPEG fallback).
export async function fileToCoverDataUrl(
  file: File,
  maxWidth = 1280,
  maxHeight = 720,
  quality = 0.8
): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      maxWidth / bitmap.width,
      maxHeight / bitmap.height
    );
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(bitmap, 0, 0, w, h);

    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) {
      url = canvas.toDataURL("image/jpeg", quality);
    }
    return url;
  } finally {
    bitmap.close();
  }
}
