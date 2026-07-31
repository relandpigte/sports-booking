"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  forgotPasswordAction,
  type PasswordResetFormState,
} from "@/lib/password-reset-actions";

const initialState: PasswordResetFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState
  );

  return (
    <>
      <form
        action={formAction}
        noValidate
        className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-4">
          {state.message && (
            <p
              role={state.ok ? "status" : "alert"}
              className={`rounded-lg px-3 py-2.5 text-sm ${
                state.ok
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {state.message}
            </p>
          )}

          {!state.ok && (
            <>
              <Input
                label="Email address"
                name="email"
                type="email"
                placeholder="Enter your account email"
                autoComplete="email"
                defaultValue={state.values?.email}
                error={state.errors?.email}
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Sending reset link…" : "Send reset link"}
              </Button>
            </>
          )}
        </div>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline"
        >
          Back to login
        </Link>
      </p>
    </>
  );
}
