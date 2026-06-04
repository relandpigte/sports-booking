"use client";

import type { FormEvent } from "react";
import { deleteUserAction } from "@/lib/admin-actions";

export function DeleteUserButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  function confirmDelete(e: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteUserAction} onSubmit={confirmDelete}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
