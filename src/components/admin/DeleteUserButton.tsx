"use client";

import { useActionState, useEffect, type FormEvent } from "react";
import {
  deleteUserAction,
  type DeleteUserState,
} from "@/lib/admin-actions";

const initialState: DeleteUserState = {};

export function DeleteUserButton({
  userId,
  name,
  blockedReason,
}: {
  userId: string;
  name: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState(
    deleteUserAction,
    initialState
  );

  useEffect(() => {
    if (state.message) window.alert(state.message);
  }, [state.message]);

  function confirmDelete(e: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) {
      e.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={confirmDelete}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending || Boolean(blockedReason)}
        title={blockedReason ?? undefined}
        className="min-h-9 rounded-lg px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
