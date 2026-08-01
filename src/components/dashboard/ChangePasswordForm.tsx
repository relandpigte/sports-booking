"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  changePasswordAction,
  type PasswordChangeFormState,
} from "@/lib/password-change-actions";

const initialState: PasswordChangeFormState = {};

export function ChangePasswordForm({
  changed,
  email,
}: {
  changed: boolean;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState
  );

  return (
    <section className="mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
      <div className="border-b border-gray-100 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Security
        </p>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-navy">
          Change password
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500">
          Confirm your current password, then choose a new one. Other signed-in
          devices will be logged out for your protection.
        </p>
      </div>

      {changed && (
        <p
          role="status"
          className="mt-5 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
        >
          Password updated. Your other sessions have been signed out.
        </p>
      )}
      {state.message && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <form action={formAction} noValidate className="mt-5 max-w-xl">
        <input
          type="email"
          name="username"
          value={email}
          autoComplete="username"
          readOnly
          tabIndex={-1}
          className="hidden"
        />
        <div className="grid grid-cols-1 gap-4">
          <Input
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            error={state.errors?.currentPassword}
          />
          <Input
            label="New password"
            name="newPassword"
            type="password"
            placeholder="Enter at least 6 characters"
            autoComplete="new-password"
            error={state.errors?.newPassword}
          />
          <Input
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            placeholder="Enter your new password again"
            autoComplete="new-password"
            error={state.errors?.confirmPassword}
          />
        </div>

        <div className="mt-6">
          <Button type="submit" disabled={pending} className="sm:w-auto sm:px-8">
            {pending ? "Updating password…" : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
