"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  simulateCheckoutAction,
  type BillingFormState,
} from "@/lib/billing-actions";

const initial: BillingFormState = {};

// Approve / Decline for the simulated e-wallet screen. Both go through the real
// webhook path, so signature verification and replay protection are exercised.
export function FakeCheckout({ paymentId }: { paymentId: string }) {
  const [state, formAction, pending] = useActionState(
    simulateCheckoutAction,
    initial
  );

  if (state.success || state.message) {
    return (
      <div className="mt-5 flex flex-col gap-3">
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success
              ? "rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
              : "rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
          }
        >
          {state.success ?? state.message}
        </p>
        <Link
          href="/dashboard/billing"
          className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Back to billing
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 flex items-center gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Button
        type="submit"
        name="outcome"
        value="approve"
        disabled={pending}
        className="flex-1"
      >
        {pending ? "Confirming…" : "Approve payment"}
      </Button>
      <button
        type="submit"
        name="outcome"
        value="decline"
        disabled={pending}
        className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        Decline
      </button>
    </form>
  );
}
