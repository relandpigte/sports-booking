"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  resetPasswordAction,
  type PasswordResetFormState,
} from "@/lib/password-reset-actions";

const initialState: PasswordResetFormState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState
  );

  return (
    <form
      action={formAction}
      noValidate
      className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6"
    >
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-4">
        {state.message && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
          >
            <p>{state.message}</p>
            <Link
              href="/forgot-password"
              className="mt-2 inline-block font-semibold underline"
            >
              Request a new link
            </Link>
          </div>
        )}
        <Input
          label="New password"
          name="password"
          type="password"
          placeholder="Enter at least 6 characters"
          autoComplete="new-password"
          error={state.errors?.password}
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          placeholder="Enter your password again"
          autoComplete="new-password"
          error={state.errors?.confirmPassword}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Updating password…" : "Reset password"}
        </Button>
      </div>
    </form>
  );
}
