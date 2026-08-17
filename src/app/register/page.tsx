"use client";

import { use, useActionState } from "react";
import Link from "next/link";

import { AuthLayout } from "@/components/AuthLayout";
import { GoogleRegistrationButton } from "@/components/auth/GoogleRegistrationButton";
import { RegistrationPasswordField } from "@/components/auth/RegistrationPasswordField";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  googleLoginAction,
  registerAction,
  type AuthFormState,
} from "@/lib/actions";

const initialState: AuthFormState = {};

export default function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    email?: string | string[];
    error?: string | string[];
  }>;
}) {
  const query = use(searchParams);
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  const invitedEmail = Array.isArray(query.email) ? query.email[0] : query.email;
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState
  );
  const googleTarget = `/register/google?role=player${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;

  return (
    <AuthLayout
      title="Create your player account"
      subtitle="Start with your email or Google. You can complete your player profile anytime."
    >
      <div className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6">
        {query.error === "existing-account" && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            That Google email already belongs to a partner account. Sign in to
            that account or use another Google account.
          </p>
        )}
        {state.message && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
          >
            {state.message}
          </p>
        )}

        <GoogleRegistrationButton
          action={googleLoginAction}
          redirectTo={googleTarget}
          label="Continue with Google"
        />
        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            or use email
          </span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form action={formAction} noValidate>
          <input type="hidden" name="redirectTo" value={next ?? ""} />
          <div className="space-y-4">
            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              defaultValue={state.values?.email ?? invitedEmail}
              error={state.errors?.email}
            />
            <RegistrationPasswordField error={state.errors?.password} />
          </div>

          <p className="mt-5 text-xs leading-5 text-gray-500">
            By creating an account, you acknowledge our{" "}
            <Link href="/terms" className="font-medium text-primary underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-primary underline">
              Privacy Policy
            </Link>
            .
          </p>

          <Button type="submit" disabled={pending} className="mt-5">
            {pending ? "Creating account…" : "Create Player Account"}
          </Button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
      <p className="mt-1.5 text-center text-sm text-gray-400">
        Run a venue?{" "}
        <Link
          href="/register/partner"
          className="font-medium text-navy hover:underline"
        >
          Create a partner account
        </Link>
      </p>
    </AuthLayout>
  );
}
