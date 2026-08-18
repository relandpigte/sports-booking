import { MAX_QR_BYTES, MAX_RECEIPT_BYTES } from "@/lib/image-constants";

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

const RECEIPT_UPLOAD_TARGET_BYTES = MAX_RECEIPT_BYTES - 100 * 1024;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/webp" | "image/jpeg",
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the compressed receipt."));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read receipt."));
    reader.readAsDataURL(blob);
  });
}

// Receipts are posted through a Server Action and stored inline until blob
// storage is configured. Re-encode iteratively so detailed phone photos stay
// legible while always fitting below the server's validated 800KB ceiling.
export async function fileToReceiptDataUrl(
  file: File,
  maxWidth = 1400,
  maxHeight = 1400,
  quality = 0.78
): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const initialScale = Math.min(
      1,
      maxWidth / bitmap.width,
      maxHeight / bitmap.height
    );
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    const qualities = [quality, 0.68, 0.58, 0.48];

    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas not supported");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const nextQuality of qualities) {
        const webp = await canvasToBlob(canvas, "image/webp", nextQuality);
        if (webp && webp.size <= RECEIPT_UPLOAD_TARGET_BYTES) {
          return blobToDataUrl(webp);
        }

        if (!webp || webp.type !== "image/webp") {
          const jpeg = await canvasToBlob(canvas, "image/jpeg", nextQuality);
          if (jpeg && jpeg.size <= RECEIPT_UPLOAD_TARGET_BYTES) {
            return blobToDataUrl(jpeg);
          }
        }
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    throw new Error("Receipt could not be compressed below the upload limit.");
  } finally {
    bitmap.close();
  }
}

const QR_UPLOAD_TARGET_BYTES = MAX_QR_BYTES - 50 * 1024;

function drawFocusedQr(
  bitmap: ImageBitmap,
  size: number
): HTMLCanvasElement {
  const shortSide = Math.min(bitmap.width, bitmap.height);
  const longSide = Math.max(bitmap.width, bitmap.height);
  // A portrait or landscape payment-app poster has substantial chrome around
  // its centered QR. Tighten those images further, but never crop an already
  // square QR where the required quiet zone may sit close to the edges.
  const sourceSize = Math.floor(
    shortSide * (longSide / shortSide >= 1.2 ? 0.82 : 1)
  );
  const sourceX = Math.floor((bitmap.width - sourceSize) / 2);
  const sourceY = Math.floor((bitmap.height - sourceSize) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not supported");
  // QR modules are hard-edged geometry. Disabling interpolation prevents a
  // downscaled payment-app screenshot from softening their boundaries.
  context.imageSmoothingEnabled = false;
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );
  return canvas;
}

// Payment QR uploads need different treatment from receipts: crop away the
// surrounding app chrome and keep the QR lossless so gallery-import scanners
// receive a large, high-contrast code.
export async function fileToQrDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    let size = Math.min(1200, bitmap.width, bitmap.height);
    while (size >= 256) {
      const png = await canvasToBlob(drawFocusedQr(bitmap, size), "image/png");
      if (png && png.size <= QR_UPLOAD_TARGET_BYTES) {
        return blobToDataUrl(png);
      }
      size = Math.floor(size * 0.8);
    }
    throw new Error("QR image could not be prepared below the upload limit.");
  } finally {
    bitmap.close();
  }
}

// Existing manual-payment methods may still contain a full portrait payment
// card. Focus it at download time too, so players save a scanner-friendly PNG
// without requiring every partner to upload the image again immediately.
export async function focusQrImageBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  try {
    const size = Math.min(1400, bitmap.width, bitmap.height);
    const png = await canvasToBlob(drawFocusedQr(bitmap, size), "image/png");
    if (!png) throw new Error("QR image could not be converted to PNG.");
    return png;
  } finally {
    bitmap.close();
  }
}
