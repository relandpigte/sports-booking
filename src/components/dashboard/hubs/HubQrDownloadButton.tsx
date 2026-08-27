"use client";

import { useEffect, useState } from "react";

type DownloadStatus = "preparing" | "idle" | "saving" | "error";
type PreparedDownload = { blob: Blob; file: File; filename: string };

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

export function HubQrDownloadButton({
  src,
  hubName,
}: {
  src: string;
  hubName: string;
}) {
  const [status, setStatus] = useState<DownloadStatus>("preparing");
  const [prepared, setPrepared] = useState<PreparedDownload | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function prepareQr() {
      setPrepared(null);
      setStatus("preparing");

      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error("Hub QR image could not be loaded");

        const blob = await response.blob();
        if (blob.type !== "image/png") {
          throw new Error("Hub QR download was not a PNG image");
        }

        const disposition = response.headers.get("content-disposition");
        const filename =
          disposition?.match(/filename="([^"]+)"/)?.[1] ??
          "bunal-hub-qr.png";
        if (!active) return;
        setPrepared({
          blob,
          file: new File([blob], filename, { type: "image/png" }),
          filename,
        });
        setStatus("idle");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setStatus("error");
      }
    }

    void prepareQr();
    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey, src]);

  async function saveQr() {
    if (status === "error") {
      setRetryKey((current) => current + 1);
      return;
    }
    if (!prepared) return;
    setStatus("saving");

    try {
      const canShareFile =
        navigator.maxTouchPoints > 0 &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [prepared.file] });

      if (canShareFile) {
        await navigator.share({
          files: [prepared.file],
          title: `${hubName} booking QR`,
        });
      } else {
        saveWithAnchor(prepared.blob, prepared.filename);
      }

      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={saveQr}
      disabled={status === "preparing" || status === "saving"}
      className="inline-flex min-h-11 w-full items-center justify-start gap-2 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-colors hover:bg-primary-soft/70 disabled:cursor-wait disabled:opacity-60"
      title={
        status === "error"
          ? "The QR could not be saved. Please try again."
          : `Save the QR code for ${hubName}`
      }
      aria-label={
        status === "error"
          ? `Retry saving the QR code for ${hubName}`
          : `Save the QR code for ${hubName}`
      }
    >
      <svg
        className="h-4 w-4 shrink-0"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="6" height="6" />
        <rect x="15" y="3" width="6" height="6" />
        <rect x="3" y="15" width="6" height="6" />
        <path d="M15 15h2v2h-2zM19 15h2v6h-6v-2M15 19h2" />
      </svg>
      {status === "saving"
        ? "Opening…"
        : status === "preparing"
          ? "Preparing…"
        : status === "error"
          ? "Retry QR"
          : "Save QR"}
    </button>
  );
}
