import qrcode from "qrcode-generator";

type ErrorCorrection = "M" | "H";

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function qrDrawing(
  data: string,
  errorCorrection: ErrorCorrection,
  quiet: number
): { count: number; size: number; path: string } {
  const qr = qrcode(0, errorCorrection);
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
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

  return { count, size: count + quiet * 2, path };
}

// A QR code as SVG. It is normally rendered on the server, but the pure,
// deterministic renderer can also run after a Server Action returns a new
// checkout URL to a Client Component.
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
  // The quiet zone is part of the spec — a QR flush against other content is
  // measurably harder for a scanner to find.
  const quiet = 2;
  const { size, path } = qrDrawing(data, "M", quiet);

  // Escaped, not trusted. Callers pass literals today, but an aria-label built
  // by string concatenation is one refactor away from carrying user input.
  const title = escapeMarkup(opts.title ?? "Payment QR code");
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

// A self-contained, print-ready hub QR card. The logo stays outside the code
// so branding never obscures modules; H-level correction and a four-module
// quiet zone make it resilient on posters, counters, and social graphics.
export function hubQrSvg(
  data: string,
  opts: { hubName: string; logoDataUrl: string }
): string {
  const quiet = 4;
  const { size, path } = qrDrawing(data, "H", quiet);
  const width = size + 20;
  const qrY = 28;
  const height = qrY + size + 24;
  const displayName =
    opts.hubName.length > 34
      ? `${opts.hubName.slice(0, 33).trimEnd()}…`
      : opts.hubName;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`,
    ` role="img" aria-label="${escapeMarkup(`QR code for ${opts.hubName}`)}">`,
    `<rect width="${width}" height="${height}" rx="4" fill="#f5faf7"/>`,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="3" fill="#ffffff" stroke="#dfe7e2" stroke-width="0.5"/>`,
    `<image href="${escapeMarkup(opts.logoDataUrl)}" x="${(width - 20) / 2}" y="3" width="20" height="14" preserveAspectRatio="xMidYMid meet"/>`,
    `<text x="${width / 2}" y="22" text-anchor="middle" fill="#10243a" font-family="Arial, sans-serif" font-size="3.4" font-weight="700">${escapeMarkup(displayName)}</text>`,
    `<g transform="translate(10 ${qrY})" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#10243a"/>`,
    `</g>`,
    `<text x="${width / 2}" y="${qrY + size + 8}" text-anchor="middle" fill="#0b8643" font-family="Arial, sans-serif" font-size="3.2" font-weight="700">Scan to view &amp; book courts</text>`,
    `<text x="${width / 2}" y="${qrY + size + 14}" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="2.6">www.bunal.club</text>`,
    `</svg>`,
  ].join("");
}
