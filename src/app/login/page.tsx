"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginAction, type AuthFormState } from "@/lib/actions";

const initialState: AuthFormState = {};

export default function LoginPage() {
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
        <form
          action={formAction}
          noValidate
          className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-4">
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
