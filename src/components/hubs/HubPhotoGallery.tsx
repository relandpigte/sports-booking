"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";

export function HubPhotoGallery({
  photos,
  hubName,
  comingSoon = false,
}: {
  photos: string[];
  hubName: string;
  comingSoon?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const visiblePhotos = photos.slice(0, 3);
  const hiddenPhotoCount = Math.max(photos.length - visiblePhotos.length, 0);
  const hasPhotos = photos.length > 0;

  const closeViewer = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const openViewer = useCallback((index: number) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setActiveIndex(index);
  }, []);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) =>
      current == null ? null : (current - 1 + photos.length) % photos.length
    );
  }, [photos.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) =>
      current == null ? null : (current + 1) % photos.length
    );
  }, [photos.length]);

  useEffect(() => {
    if (activeIndex == null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeViewer();
        return;
      }
      if (photos.length > 1 && event.key === "ArrowLeft") {
        showPrevious();
        return;
      }
      if (photos.length > 1 && event.key === "ArrowRight") {
        showNext();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [activeIndex, closeViewer, photos.length, showNext, showPrevious]);

  return (
    <>
      <section
        aria-label={`${hubName} photo gallery`}
        className="mx-auto mt-4 w-full max-w-7xl px-2 sm:px-4"
      >
        <div className="grid h-[220px] grid-cols-1 gap-2 md:h-[300px] md:grid-cols-3 md:gap-3">
          <div
            className={`relative overflow-hidden rounded-2xl bg-slate-200 ${visiblePhotos.length > 1 ? "md:col-span-2" : "md:col-span-3"}`}
          >
            {hasPhotos ? (
              <PhotoButton
                src={photos[0]}
                alt={`${hubName} cover photo`}
                label={`Open ${hubName} photo 1 of ${photos.length}`}
                onClick={() => openViewer(0)}
                contained
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-slate-400">
                No cover photo
              </div>
            )}

            {comingSoon && (
              <div className="pointer-events-none absolute -left-20 top-12 z-20 w-72 -rotate-45 bg-navy/95 py-3 text-center shadow-xl">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-accent sm:text-sm">
                  Coming soon
                </span>
              </div>
            )}

            {hasPhotos && (
              <button
                type="button"
                onClick={() => openViewer(0)}
                className="absolute bottom-3 right-3 z-20 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/70 bg-white/95 px-4 py-2 text-sm font-bold text-navy shadow-lg backdrop-blur-sm transition-colors hover:bg-white md:hidden"
              >
                <GridIcon />
                {photos.length > 1
                  ? `View all ${photos.length} photos`
                  : "View photo"}
              </button>
            )}
          </div>

          {visiblePhotos.length > 1 && (
            <div
              className={`hidden gap-3 md:grid ${visiblePhotos.length > 2 ? "grid-rows-2" : "grid-rows-1"}`}
            >
              {visiblePhotos.slice(1).map((src, offset) => {
                const index = offset + 1;
                const showCount =
                  index === visiblePhotos.length - 1 && hiddenPhotoCount > 0;

                return (
                  <div
                    key={`${src}-${index}`}
                    className="relative overflow-hidden rounded-2xl bg-slate-200"
                  >
                    <PhotoButton
                      src={src}
                      alt={`${hubName} photo ${index + 1}`}
                      label={`Open ${hubName} photo ${index + 1} of ${photos.length}`}
                      onClick={() => openViewer(index)}
                    />
                    {showCount && (
                      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-navy/40">
                        <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-navy shadow-lg">
                          +{hiddenPhotoCount} more
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {activeIndex != null && hasPhotos && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${hubName} photo viewer`}
          className="fixed inset-0 z-[100] flex flex-col bg-navy"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeViewer}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CloseIcon />
              Close
            </button>
            <p aria-live="polite" className="text-sm font-semibold text-white/75">
              {activeIndex + 1} of {photos.length}
            </p>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-8 md:p-12">
            <img
              src={photos[activeIndex]}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-3xl"
            />
            <img
              src={photos[activeIndex]}
              alt={`${hubName} photo ${activeIndex + 1} of ${photos.length}`}
              className="relative z-10 max-h-full max-w-full object-contain"
            />

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  aria-label="Show previous photo"
                  className="absolute left-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-navy/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-white/15 sm:left-6 sm:h-14 sm:w-14"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  aria-label="Show next photo"
                  className="absolute right-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-navy/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-white/15 sm:right-6 sm:h-14 sm:w-14"
                >
                  <ChevronIcon direction="right" />
                </button>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="shrink-0 overflow-x-auto border-t border-white/10 px-4 py-4 sm:px-6">
              <div className="mx-auto flex w-max gap-2 sm:gap-3">
                {photos.map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Show photo ${index + 1}`}
                    aria-current={index === activeIndex ? "true" : undefined}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition-all sm:h-16 sm:w-24 ${
                      index === activeIndex
                        ? "ring-2 ring-accent ring-offset-2 ring-offset-navy"
                        : "opacity-50 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PhotoButton({
  src,
  alt,
  label,
  onClick,
  contained = false,
}: {
  src: string;
  alt: string;
  label: string;
  onClick: () => void;
  contained?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative block h-full w-full overflow-hidden text-left"
    >
      {contained && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl transition-transform duration-300 group-hover:scale-[1.13] motion-reduce:transition-none"
        />
      )}
      <img
        src={src}
        alt={alt}
        className={`relative h-full w-full transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none ${contained ? "object-contain" : "object-cover"}`}
      />
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </button>
  );
}

function GridIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
