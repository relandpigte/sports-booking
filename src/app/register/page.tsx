"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { SKILL_LEVELS, DEFAULT_SKILL_LEVEL } from "@/lib/constants";
import { registerAction, type AuthFormState } from "@/lib/actions";

const initialState: AuthFormState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState
  );
  const [privateProfile, setPrivateProfile] = useState(false);
  const [agreed, setAgreed] = useState(false);

  return (
    <AuthLayout
      title="Create your player account"
      subtitle="Free to join. Book courts across Bohol in a few taps."
    >
      <>
        <form
          action={formAction}
          noValidate
          className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6"
        >
          {state.message && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
            >
              {state.message}
            </p>
          )}

          {/* Profile picture */}
          <AvatarUpload error={state.errors?.image} />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              name="fullName"
              placeholder="Enter your full legal name"
              autoComplete="name"
              defaultValue={state.values?.fullName}
              error={state.errors?.fullName}
            />
            <Input
              label="Player Name"
              name="playerName"
              placeholder="Name displayed in games"
              autoComplete="nickname"
              defaultValue={state.values?.playerName}
              error={state.errors?.playerName}
            />
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
              label="Telephone Number"
              name="phone"
              type="tel"
              placeholder="Enter your telephone number"
              autoComplete="tel"
              defaultValue={state.values?.phone}
              error={state.errors?.phone}
            />
          </div>

          <div className="mt-4">
            <Select
              label="Skill Level"
              name="skillLevel"
              defaultValue={state.values?.skillLevel ?? DEFAULT_SKILL_LEVEL}
              options={[...SKILL_LEVELS]}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Password"
              name="password"
              type="password"
              placeholder="Enter password (min 6 characters)"
              autoComplete="new-password"
              error={state.errors?.password}
            />
            <Input
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              autoComplete="new-password"
              error={state.errors?.confirmPassword}
            />
          </div>

          {/* Privacy settings */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Privacy Settings
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Turning this on will lock your profile from other players. Your
                name and email will be hidden when you join sessions.
              </p>
            </div>
            <Toggle
              checked={privateProfile}
              onChange={setPrivateProfile}
              label="Private profile"
            />
          </div>
          <input
            type="hidden"
            name="privateProfile"
            value={privateProfile ? "on" : "off"}
          />

          {/* Terms */}
          <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-gray-200 p-3.5 text-sm text-gray-600">
            <input
              type="checkbox"
              name="agreed"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary accent-[var(--color-primary)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="font-medium text-primary underline">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-primary underline">
                Privacy Policy
              </Link>
            </span>
          </label>
          {state.errors?.agreed && (
            <p className="mt-1 text-xs text-red-500">{state.errors.agreed}</p>
          )}

          <div className="mt-5">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating account…" : "Create Player Account"}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            Log in
          </Link>
        </p>
        <p className="mt-1.5 text-center text-sm text-gray-400">
          Running a venue or club?{" "}
          <Link
            href="/register/partner"
            className="font-medium text-navy hover:underline"
          >
            Register as a partner
          </Link>
        </p>
      </>
    </AuthLayout>
  );
}
