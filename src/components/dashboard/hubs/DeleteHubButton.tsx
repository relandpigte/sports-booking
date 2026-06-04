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
    <form action={deleteHubAction} onSubmit={confirmDelete}>
      <input type="hidden" name="id" value={hubId} />
      <button
        type="submit"
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
