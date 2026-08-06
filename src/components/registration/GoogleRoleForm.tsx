"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  completeGoogleRegistrationAction,
  type GoogleRegistrationFormState,
} from "@/lib/google-registration-actions";

const initialState: GoogleRegistrationFormState = {};

export function GoogleRoleForm({
  defaultRole,
  next,
}: {
  defaultRole: "PLAYER" | "PARTNER";
  next: string;
}) {
  const [role, setRole] = useState(defaultRole);
  const [state, action, pending] = useActionState(
    completeGoogleRegistrationAction,
    initialState
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.message && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      {[
        {
          value: "PLAYER" as const,
          title: "I’m a player",
          description: "Discover venues, join events, and book courts.",
        },
        {
          value: "PARTNER" as const,
          title: "I run a venue",
          description: "Create a draft partner account and submit venue details later.",
        },
      ].map((option) => (
        <label
          key={option.value}
          className={`block cursor-pointer rounded-2xl border bg-white p-5 shadow-sm transition-colors ${
            role === option.value
              ? "border-primary ring-2 ring-primary/15"
              : "border-gray-200 hover:border-primary/40"
          }`}
        >
          <span className="flex items-start gap-3">
            <input
              type="radio"
              name="role"
              value={option.value}
              checked={role === option.value}
              onChange={() => setRole(option.value)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-bold text-navy">{option.title}</span>
              <span className="mt-1 block text-sm leading-6 text-gray-500">
                {option.description}
              </span>
            </span>
          </span>
        </label>
      ))}
      {state.errors?.role && (
        <p className="text-xs text-red-500">{state.errors.role}</p>
      )}

      <p className="text-xs leading-5 text-gray-500">
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

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create Account"}
      </Button>
    </form>
  );
}
