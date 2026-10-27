"use client";

import { useEffect, useState, type ReactNode } from "react";

type Prepared = { blob: Blob; file: File };

// Decode locally rather than fetch(): connect-src does not allow data: URLs.
function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Unsupported QR image URL");
  const type = match[1] || "image/png";
  const payload = match[3];
  if (!match[2]) {
    return new Blob([decodeURIComponent(payload)], { type });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

function saveWithAnchor(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

// A plain <a download> sends the image to Files on iOS. The share sheet is
// the only way a web page can offer "Save Image", which saves to Photos, so
// touch devices get the share sheet and everything else a normal download.
// The file is prepared ahead of the tap because iOS only opens the share
// sheet while the tap's user activation is still fresh.
export function SaveQrImageButton({
  src,
  filename,
  shareTitle,
  className,
  children,
}: {
  src: string;
  filename: string;
  shareTitle: string;
  className?: string;
  children: ReactNode;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function prepare() {
      setPrepared(null);
      try {
        const blob = src.startsWith("data:")
          ? dataUrlToBlob(src)
          : await fetch(src, { signal: controller.signal }).then((response) => {
              if (!response.ok) throw new Error("QR image could not be loaded");
              return response.blob();
            });
        if (!active) return;
        setPrepared({
          blob,
          file: new File([blob], filename, { type: blob.type || "image/png" }),
        });
      } catch {
        // Leave prepared empty; the click falls back to opening the source.
      }
    }

    void prepare();
    return () => {
      active = false;
      controller.abort();
    };
  }, [filename, src]);

  async function save() {
    if (!prepared) {
      window.open(src, "_blank", "noopener");
      return;
    }
    setSaving(true);
    try {
      const canShareFile =
        navigator.maxTouchPoints > 0 &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [prepared.file] });

      if (canShareFile) {
        await navigator.share({ files: [prepared.file], title: shareTitle });
      } else {
        saveWithAnchor(prepared.blob, filename);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        saveWithAnchor(prepared.blob, filename);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={saving}
      className={className}
    >
      {children}
    </button>
  );
}
