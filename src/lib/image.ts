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
