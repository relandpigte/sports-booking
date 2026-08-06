"use client";

import { useActionState } from "react";
import Link from "next/link";

import { GoogleRegistrationButton } from "@/components/auth/GoogleRegistrationButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  googleLoginAction,
  registerPartnerAction,
  type AuthFormState,
} from "@/lib/actions";

const initialState: AuthFormState = {};

export function PartnerRegisterForm({
  existingAccountError = false,
}: {
  existingAccountError?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    registerPartnerAction,
    initialState
  );

  return (
    <form
      action={formAction}
      noValidate
      className="rounded-3xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-8"
    >
      {existingAccountError && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          That Google email already belongs to a player account. Sign in to
          that account or use another Google account.
        </p>
      )}
      {state.message && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <GoogleRegistrationButton
        action={googleLoginAction}
        redirectTo="/register/google?role=partner"
        label="Continue with Google"
      />
      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          or use email
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="space-y-4">
        <Input
          label="Email Address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="owner@example.com"
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          error={state.errors?.password}
        />
        <Input
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Enter your password again"
          error={state.errors?.confirmPassword}
        />
      </div>

      <p className="mt-5 text-xs leading-5 text-gray-500">
        By creating an account, you acknowledge our{" "}
        <Link href="/terms" className="font-semibold text-primary hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <Button type="submit" disabled={pending} className="mt-5 rounded-xl py-4 text-base">
        {pending ? "Creating account…" : "Create Partner Account"}
      </Button>
    </form>
  );
}
