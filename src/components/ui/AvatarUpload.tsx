"use client";

import { useRef, useState } from "react";
import { fileToAvatarDataUrl } from "@/lib/image";

interface AvatarUploadProps {
  name?: string;
  defaultValue?: string | null;
  label?: string;
  error?: string;
}

export function AvatarUpload({
  name = "image",
  defaultValue,
  label = "Profile Picture",
  error,
}: AvatarUploadProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      setValue(await fileToAvatarDataUrl(file));
    } catch {
      setLocalError("Couldn't process that image. Try another file.");
    } finally {
      setBusy(false);
      // allow re-selecting the same file
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-medium text-gray-700">
        {label} <span className="font-normal text-gray-400">(Optional)</span>
      </p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-primary hover:text-primary"
        aria-label="Upload profile picture"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Profile preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {busy ? "Processing…" : value ? "Change" : "Upload Photo"}
        </button>
        {value && !busy && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>

      {(localError || error) && (
        <p className="text-xs text-red-500">{localError ?? error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
