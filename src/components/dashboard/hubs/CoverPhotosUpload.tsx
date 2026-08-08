"use client";

import { useRef, useState } from "react";
import { fileToCoverDataUrl } from "@/lib/image";
import { MAX_COVERS } from "@/lib/image-constants";

export function CoverPhotosUpload({
  defaultValue = [],
  error,
}: {
  defaultValue?: string[];
  error?: string;
}) {
  const [photos, setPhotos] = useState<string[]>(defaultValue);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      const room = MAX_COVERS - photos.length;
      if (room <= 0) {
        setLocalError(`You can add at most ${MAX_COVERS} cover photos.`);
        return;
      }
      const toAdd = files.slice(0, room);
      const urls: string[] = [];
      for (const file of toAdd) urls.push(await fileToCoverDataUrl(file));
      setPhotos((p) => [...p, ...urls]);
      if (files.length > room) {
        setLocalError(`Only ${MAX_COVERS} cover photos allowed.`);
      }
    } catch {
      setLocalError("Couldn't process an image. Try another file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(index: number) {
    setPhotos((p) => p.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-800">
        Cover Photos{" "}
        <span className="font-normal text-gray-400">(up to {MAX_COVERS})</span>
      </span>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((src, i) => (
          <div
            key={i}
            className="relative aspect-video overflow-hidden rounded-lg border border-gray-200"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Cover" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-black/80"
            >
              Remove
            </button>
            <input type="hidden" name="coverPhotos" value={src} />
          </div>
        ))}

        {photos.length < MAX_COVERS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {busy ? "Processing…" : "+ Add photos"}
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
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
