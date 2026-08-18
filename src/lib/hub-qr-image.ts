import "server-only";

import sharp from "sharp";

import { hubQrSvg } from "@/lib/qr";

export const HUB_QR_JPEG_WIDTH = 1200;

// Hub QR downloads are shared on social media and printed at venue counters.
// Render the scalable source at a high density before encoding so the JPEG's
// lossy compression cannot soften the individual QR modules enough to affect
// scanning.
export async function hubQrJpeg(
  data: string,
  opts: { hubName: string; logoDataUrl: string }
): Promise<Buffer> {
  const svg = hubQrSvg(data, opts);

  return sharp(Buffer.from(svg), { density: 1800 })
    .resize({ width: HUB_QR_JPEG_WIDTH })
    .flatten({ background: "#ffffff" })
    .jpeg({
      quality: 100,
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
    })
    .toBuffer();
}
