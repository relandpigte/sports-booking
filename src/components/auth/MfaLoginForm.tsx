"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  verifyMfaLoginAction,
  type MfaFormState,
} from "@/lib/security-actions";

const initialState: MfaFormState = {};

export function MfaLoginForm() {
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [state, action, pending] = useActionState(
    verifyMfaLoginAction,
    initialState
  );

  return (
    <form
      action={action}
      className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6"
    >
      <input
        type="hidden"
        name="useRecoveryCode"
        value={useRecoveryCode ? "true" : "false"}
      />
      {state.message && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}
      <Input
        label={useRecoveryCode ? "Recovery code" : "6-digit authenticator code"}
        name="code"
        inputMode={useRecoveryCode ? "text" : "numeric"}
        autoComplete="one-time-code"
        placeholder={useRecoveryCode ? "XXXX-XXXX-XXXX" : "000000"}
        maxLength={useRecoveryCode ? 16 : 6}
        required
        autoFocus
      />
      <Button type="submit" disabled={pending} className="mt-5">
        {pending ? "Verifying…" : "Verify and continue"}
      </Button>
      <button
        type="button"
        onClick={() => setUseRecoveryCode((value) => !value)}
        className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline"
      >
        {useRecoveryCode
          ? "Use an authenticator code instead"
          : "Use a recovery code"}
      </button>
    </form>
  );
}

