"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  completeLoginMfaSetupAction,
  finishAccountMfaSetupAction,
  verifyAccountMfaSetupAction,
  verifyLoginMfaSetupAction,
  type MfaFormState,
} from "@/lib/security-actions";

const initialState: MfaFormState = {};

export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-950">Save your recovery codes</h3>
      <p className="mt-1 text-sm leading-6 text-amber-800">
        Store these somewhere safe. Each code works once, and they will not be
        shown again.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-white p-4 font-mono text-sm text-navy sm:grid-cols-2">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
    </div>
  );
}

export function MfaSetupForm({
  accountSetup,
}: {
  accountSetup: boolean;
}) {
  const [state, action, pending] = useActionState(
    accountSetup ? verifyAccountMfaSetupAction : verifyLoginMfaSetupAction,
    initialState
  );

  if (state.recoveryCodes) {
    return (
      <div className="mt-5">
        <RecoveryCodes codes={state.recoveryCodes} />
        {state.loginGrantReady ? (
          <form action={completeLoginMfaSetupAction} className="mt-4">
            <input
              type="hidden"
              name="redirectTo"
              value={state.redirectTo ?? "/dashboard"}
            />
            <Button type="submit">I saved the codes — continue</Button>
          </form>
        ) : (
          <form action={finishAccountMfaSetupAction} className="mt-4">
            <Button type="submit">I saved the codes — finish</Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 grid grid-cols-1 gap-4">
      {state.message && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}
      {accountSetup && (
        <Input
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      )}
      <Input
        label="6-digit code from your authenticator"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify and enable MFA"}
      </Button>
    </form>
  );
}
