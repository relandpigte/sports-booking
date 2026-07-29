import "server-only";

import qrcode from "qrcode-generator";

// A QR code as SVG, rendered on the server.
//
// The encoder is dependency-free and only produces a matrix of dark/light
// modules; the drawing is ours, the same way the revenue chart is. That keeps
// the output styleable with CSS, scalable without blurring, and free of any
// client JavaScript — a QR that needs hydration to appear is a QR nobody can
// screenshot.
//
// One <rect> per dark module would be a thousand elements; this emits a single
// path built from horizontal runs instead, which is roughly a tenth the markup
// and renders identically.
export function qrSvg(
  data: string,
  opts: { className?: string; title?: string } = {}
): string {
  // Type 0 = pick the smallest version that fits. Error correction M tolerates
  // ~15% damage, which is the usual choice for a screen: high enough to
  // survive a phone camera at an angle, low enough to keep the modules big.
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
  // The quiet zone is part of the spec — a QR flush against other content is
  // measurably harder for a scanner to find.
  const quiet = 2;
  const size = count + quiet * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    let run = 0;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark) {
        run++;
        continue;
      }
      if (run > 0) {
        path += `M${col - run + quiet} ${row + quiet}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }

  // Escaped, not trusted. Callers pass literals today, but an aria-label built
  // by string concatenation is one refactor away from carrying user input.
  const title = (opts.title ?? "Payment QR code")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="${title}"`,
    opts.className ? ` class="${opts.className}"` : "",
    `>`,
    // A white field behind the code: scanners need the light modules to be
    // light, whatever the card behind it is doing.
    `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#10243a"/>`,
    `</svg>`,
  ].join("");
}
