"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { SKILL_LEVELS, DEFAULT_SKILL_LEVEL } from "@/lib/constants";
import { registerAction, type AuthFormState } from "@/lib/actions";

const initialState: AuthFormState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPhotoPreview(URL.createObjectURL(file));
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Player Registration
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Play. Book. Connect. All in one app.
            </p>
          </div>
        </div>

        <Link href="/login" className="mt-6 block">
          <Button type="button">Already have an account? Log In</Button>
        </Link>
        <p className="mt-3 text-center text-sm text-gray-400">
          Or create an account here
        </p>

        <form
          action={formAction}
          noValidate
          className="mt-4 rounded-2xl border border-gray-200 p-5 sm:p-6"
        >
          {state.message && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
            >
              {state.message}
            </p>
          )}

          {/* Profile picture (preview only — not yet persisted) */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-gray-700">
              Profile Picture{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-primary hover:text-primary"
              aria-label="Upload profile picture"
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Profile preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

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
      </div>
    </main>
  );
}
