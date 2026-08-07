"use client";

import { useRef, useState } from "react";

import { fileToReceiptDataUrl } from "@/lib/image";

export function ReceiptUpload({
  error,
  name = "receiptImage",
  label = "Payment receipt",
  initialValue = "",
  required = true,
  variant = "default",
  onValueChange,
}: {
  error?: string;
  name?: string;
  label?: string;
  initialValue?: string;
  required?: boolean;
  variant?: "default" | "checkout";
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      const nextValue = await fileToReceiptDataUrl(file);
      setValue(nextValue);
      onValueChange?.(nextValue);
    } catch {
      setLocalError("Couldn't process that receipt. Try another image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">
        {label}{required ? "" : " (optional)"}
      </span>
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={`${label} preview`}
            className="max-h-64 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => {
              setValue("");
              onValueChange?.("");
            }}
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
          className={`rounded-xl border-2 border-dashed px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
            variant === "checkout"
              ? "flex flex-col items-center justify-center border-slate-200 bg-slate-50 py-10 text-slate-500 hover:border-primary hover:bg-primary-soft/40 hover:text-primary"
              : "border-gray-300 py-8 text-gray-500 hover:border-primary hover:text-primary"
          }`}
        >
          {variant === "checkout" && !busy && (
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="mb-3 text-slate-400"
            >
              <path d="M12 16V4" />
              <path d="m7 9 5-5 5 5" />
              <path d="M5 14v5h14v-5" />
            </svg>
          )}
          <span>{busy ? "Processing…" : `Upload ${label.toLowerCase()}`}</span>
          {variant === "checkout" && !busy && (
            <span className="mt-1 text-xs font-normal text-slate-400">
              PNG, JPG, or WebP · processed under 800KB
            </span>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <input type="hidden" name={name} value={value} />
      {(localError || error) && (
        <p className="text-xs text-red-500">{localError ?? error}</p>
      )}
    </div>
  );
}
