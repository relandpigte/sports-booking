"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { registerPartnerAction, type AuthFormState } from "@/lib/actions";
import { PLATFORM_FEE_RATE } from "@/lib/constants";

const initialState: AuthFormState = {};

export function PartnerRegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerPartnerAction,
    initialState
  );
  const [agreed, setAgreed] = useState(false);

  return (
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

      <AvatarUpload label="Logo or profile picture" error={state.errors?.image} />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Business Name"
          name="businessName"
          autoComplete="organization"
          defaultValue={state.values?.businessName ?? ""}
          error={state.errors?.businessName}
        />
        <Input
          label="Your Name"
          name="fullName"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? ""}
          error={state.errors?.fullName}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? ""}
          error={state.errors?.email}
        />
        <Input
          label="Telephone Number"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.values?.phone ?? ""}
          error={state.errors?.phone}
        />
        {/* Spans both columns: a URL in a half-width box is unreadable. */}
        <div className="sm:col-span-2">
          <Input
            label="Facebook page (optional)"
            name="facebookPage"
            placeholder="facebook.com/yourvenue"
            autoComplete="off"
            defaultValue={state.values?.facebookPage ?? ""}
            error={state.errors?.facebookPage}
          />
          <p className="mt-1 text-xs text-gray-400">
            A link or just the page name — both work. Most players will look for
            you here first.
          </p>
        </div>
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={state.errors?.password}
        />
        <Input
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={state.errors?.confirmPassword}
        />
      </div>

      {/* No plan and no payment method: joining is free. The only money that
          moves is the service fee a player pays on top of a booking, and the
          venue keeps their full court rate. */}
      <div className="mt-6 rounded-xl border border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">
          Free to join. No monthly fee.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Players pay a {Math.round(PLATFORM_FEE_RATE * 100)}% service fee on
          top of your court rate, and you keep every peso you charge. We invoice
          those fees back once a month — so you only pay us once you have been
          paid.
        </p>
      </div>

      <label className="mt-6 flex items-start gap-2.5 text-sm text-gray-600">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-medium text-primary hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.errors?.agreed && (
        <p className="mt-1 text-xs text-red-500">{state.errors.agreed}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-6">
        {pending ? "Creating account…" : "Create partner account"}
      </Button>
    </form>
  );
}

