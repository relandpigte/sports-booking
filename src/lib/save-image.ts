// Client-side helpers for saving payment QR images.
//
// On iPhone and iPad a download always lands in Files; the share sheet's
// "Save Image" is the only way a page can put an image in Photos. Elsewhere
// a normal download is better: Android shows Downloads in the gallery that
// bank and e-wallet apps import from, while its share sheet has no plain
// save option, and desktops (including Windows touchscreens) expect a file.

function isAppleMobile(): boolean {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; only the touch points give it away.
  return /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
}

export function shouldShareImageFile(file: File): boolean {
  return (
    isAppleMobile() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}
