"use client";

import type { FormEvent } from "react";
import { deleteHubAction } from "@/lib/hub-actions";

export function DeleteHubButton({
  hubId,
  name,
}: {
  hubId: string;
  name: string;
}) {
  function confirmDelete(e: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteHubAction} onSubmit={confirmDelete} className="contents">
      <input type="hidden" name="id" value={hubId} />
      <button
        type="submit"
        className="flex min-h-11 w-full items-center justify-start gap-2 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-100 transition-colors hover:bg-red-100"
      >
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" />
        </svg>
        Delete
      </button>
    </form>
  );
}
