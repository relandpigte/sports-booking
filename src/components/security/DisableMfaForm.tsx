"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  disableMfaAction,
  type MfaFormState,
} from "@/lib/security-actions";

const initialState: MfaFormState = {};

export function DisableMfaForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    disableMfaAction,
    initialState
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-red-600 hover:underline"
      >
        Disable MFA
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-5 max-w-xl rounded-xl border border-red-200 bg-red-50/50 p-4"
    >
      <h3 className="font-bold text-red-950">Confirm MFA removal</h3>
      <p className="mt-1 text-sm text-red-800">
        All sessions will be signed out after MFA is disabled.
      </p>
      {state.message && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          label="Authenticator or recovery code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={16}
          required
        />
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="w-auto bg-red-600 px-5 hover:bg-red-700"
        >
          {pending ? "Disabling…" : "Disable MFA"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 text-sm font-semibold text-gray-600 hover:text-navy"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
