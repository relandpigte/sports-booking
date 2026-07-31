"use client";

import { useRef, useState } from "react";

import { fileToReceiptDataUrl } from "@/lib/image";

export function ReceiptUpload({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      setValue(await fileToReceiptDataUrl(file));
    } catch {
      setLocalError("Couldn't process that receipt. Try another image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">Payment receipt</span>
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Settlement receipt preview"
            className="max-h-64 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-gray-300 px-4 py-8 text-sm font-medium text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {busy ? "Processing…" : "Upload receipt image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <input type="hidden" name="receiptImage" value={value} />
      {(localError || error) && (
        <p className="text-xs text-red-500">{localError ?? error}</p>
      )}
    </div>
  );
}
