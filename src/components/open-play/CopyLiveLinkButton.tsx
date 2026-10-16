"use client";

import { useState } from "react";

export function CopyLiveLinkButton({
  url,
  className = "min-h-10 rounded-xl bg-primary-soft px-3 py-2 text-xs font-black text-primary transition hover:bg-accent-soft",
}: {
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      }}
      className={className}
    >
      {copied ? "Link copied" : "Copy live link"}
    </button>
  );
}
