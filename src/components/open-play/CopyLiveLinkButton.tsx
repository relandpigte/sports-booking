"use client";

import { useState } from "react";

export function CopyLiveLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      }}
      className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-xs font-black text-primary hover:bg-accent-soft"
    >
      {copied ? "Link copied" : "Copy live link"}
    </button>
  );
}
