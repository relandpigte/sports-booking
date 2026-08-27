"use client";

import { useState } from "react";

export type ShareButtonVariant = "compact" | "default" | "media";

export function ShareButton({
  title,
  url,
  subject,
  variant = "default",
  className = "",
}: {
  title: string;
  url: string;
  subject: string;
  variant?: ShareButtonVariant;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  const compact = variant !== "default";
  const baseClassName =
    variant === "compact"
      ? "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-white/20"
      : variant === "media"
        ? "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-navy/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-navy/85"
        : "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-navy shadow-sm transition-colors hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? `${subject} link copied` : `Share ${subject}`}
      title={copied ? "Link copied" : `Share ${subject}`}
      className={`${baseClassName} ${className}`.trim()}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.7 6.8-4M8.6 13.3l6.8 4" />
      </svg>
      {variant === "default" ? (copied ? "Link copied" : "Share") : null}
      {compact && copied ? (
        <span className="absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-navy shadow-lg">
          Copied
        </span>
      ) : null}
    </button>
  );
}
