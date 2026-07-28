"use client";

import { useEffect, useRef } from "react";

// A small dialog for things the partner must acknowledge — a plan limit, a
// blocked save. Built on <dialog> so focus trapping, Escape and the backdrop
// come from the platform rather than hand-rolled key handlers.
export function Modal({
  open,
  onClose,
  title,
  tone = "neutral",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tone?: "neutral" | "warn";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // showModal/close are imperative DOM calls on an external element, which
    // is exactly what an effect is for.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape and backdrop dismissal both route through the same handler.
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-gray-200 p-0 backdrop:bg-black/40 sm:w-full"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {tone === "warn" && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <div className="mt-1.5 text-sm text-gray-600">{children}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {footer ?? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
