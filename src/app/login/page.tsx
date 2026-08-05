"use client";

import { use, useActionState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  googleLoginAction,
  loginAction,
  type AuthFormState,
} from "@/lib/actions";

const initialState: AuthFormState = {};

function oauthErrorMessage(error: string | string[] | undefined) {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;
  if (code === "AccessDenied") {
    return "Google could not verify the email address for this account.";
  }
  if (code === "Configuration") {
    return "Google sign-in is temporarily unavailable. Please use your email and password.";
  }
  return "Google sign-in could not be completed. Please try again.";
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    reset?: string | string[];
    password?: string | string[];
    mfa?: string | string[];
    session?: string | string[];
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  const query = use(searchParams);
  const redirectTo = Array.isArray(query.next) ? query.next[0] : query.next ?? "";
  const oauthError = oauthErrorMessage(query.error);
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to book a court or manage your venue."
    >
      <>
        <div className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6">
          {oauthError && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
            >
              {oauthError}
            </p>
          )}
          <form action={googleLoginAction}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.259c-.805.54-1.835.86-3.046.86-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.58C13.463.892 11.425 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58Z"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              or
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form action={formAction} noValidate>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="flex flex-col gap-4">
              {query.reset === "success" && (
                <p
                  role="status"
                  className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                >
                  Your password has been reset. Log in with your new password.
                </p>
              )}
              {query.password === "changed" && (
                <p
                  role="status"
                  className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                >
                  Your password was updated. Log in with your new password.
                </p>
              )}
              {query.mfa === "disabled" && (
                <p
                  role="status"
                  className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                >
                  Multi-factor authentication was disabled. Sign in again to
                  continue.
                </p>
              )}
              {query.session === "revoked" && (
                <p
                  role="status"
                  className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                >
                  That session was revoked successfully.
                </p>
              )}
              {state.message && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
                >
                  {state.message}
                </p>
              )}
              <Input
                label="Email Address"
                name="email"
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                defaultValue={state.values?.email}
                error={state.errors?.email}
              />
              <Input
                label="Password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                error={state.errors?.password}
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Logging in…" : "Log In"}
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline"
          >
            Create one here
          </Link>
        </p>
        <p className="mt-1.5 text-center text-sm text-gray-400">
          Running a venue?{" "}
          <Link
            href="/register/partner"
            className="font-medium text-navy hover:underline"
          >
            List it on Bunal.club
          </Link>
        </p>
      </>
    </AuthLayout>
  );
}
