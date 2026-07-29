"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioCards } from "@/components/ui/RadioCards";
import {
  cancelSubscriptionAction,
  changePlanAction,
  payNowAction,
  removeCardAction,
  resumeSubscriptionAction,
  setPaymentMethodAction,
  type BillingFormState,
} from "@/lib/billing-actions";
import { formatPHP } from "@/lib/currency";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { PlanView } from "@/lib/billing";

const initial: BillingFormState = {};

function Banner({ state }: { state: BillingFormState }) {
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
      >
        {state.success}
      </p>
    );
  }
  if (state.message) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
      >
        {state.message}
      </p>
    );
  }
  return null;
}

// Pays what's owed. An e-wallet charge comes back as a redirect the partner has
// to approve — we never charge one silently.
export function PayNowButton({ amount }: { amount: number }) {
  const [state, formAction, pending] = useActionState(payNowAction, initial);
  const router = useRouter();

  if (state.redirectUrl) {
    router.push(state.redirectUrl);
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Banner state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Processing…" : `Pay ${formatPHP(amount)} now`}
      </Button>
    </form>
  );
}

export function ChangePlanPanel({
  plans,
  currentPlanId,
  courtCount,
}: {
  plans: PlanView[];
  currentPlanId: string;
  courtCount: number;
}) {
  const current = plans.find((p) => p.id === currentPlanId);
  const [planKey, setPlanKey] = useState<string>(current?.key ?? "STARTER");
  const [state, formAction, pending] = useActionState(changePlanAction, initial);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-5 sm:p-6"
    >
      <h2 className="text-base font-semibold text-gray-900">Plan</h2>
      <Banner state={state} />
      <RadioCards
        name="planKey"
        value={planKey}
        onChange={setPlanKey}
        error={state.errors?.planKey}
        options={plans.map((plan) => {
          // A tier that can't hold what they already run is shown, but
          // disabled with the reason — never silently missing.
          const tooSmall =
            plan.maxCourts != null && courtCount > plan.maxCourts;
          return {
            value: plan.key,
            label: plan.name,
            meta: `${formatPHP(plan.priceMonthly)}/mo`,
            description:
              plan.maxCourts == null
                ? "Unlimited courts"
                : `Up to ${plan.maxCourts} courts`,
            disabled: tooSmall,
            disabledReason: tooSmall
              ? `You have ${courtCount} courts — remove some first.`
              : undefined,
          };
        })}
      />
      <Button
        type="submit"
        disabled={pending || planKey === current?.key}
        className="sm:w-auto sm:px-8"
      >
        {pending ? "Updating…" : "Change plan"}
      </Button>
      <p className="text-xs text-gray-400">
        The new rate applies from your next payment — no charge today, no
        proration.
      </p>
    </form>
  );
}

export function PaymentMethodPanel({
  method,
  card,
  hosted,
}: {
  method: string;
  // Cards can't be saved with a hosted gateway — the details never reach this
  // server. The method chooser stays, because it still records how the partner
  // intends to pay, which is what the admin sees when chasing an invoice.
  hosted: boolean;
  card: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
}) {
  const [selected, setSelected] = useState<string>(method);
  const [state, formAction, pending] = useActionState(
    setPaymentMethodAction,
    initial
  );
  const [removeState, removeAction, removing] = useActionState(
    removeCardAction,
    initial
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">How you pay</h2>

      {hosted && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          You&apos;ll pay each month through a secure PayMongo page — card,
          GCash or Maya. Nothing is stored here, and nothing is ever charged
          without you approving it.
        </p>
      )}

      {card && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
          <span className="text-gray-700">
            {card.brand ? card.brand.toUpperCase() : "Card"} ••••{" "}
            {card.last4}
            {card.expMonth && card.expYear
              ? ` · expires ${String(card.expMonth).padStart(2, "0")}/${card.expYear}`
              : ""}
          </span>
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removing}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </form>
        </div>
      )}
      <Banner state={removeState} />

      <form action={formAction} className="flex flex-col gap-3">
        <Banner state={state} />
        <RadioCards
          name="method"
          value={selected}
          onChange={setSelected}
          error={state.errors?.method}
          options={PAYMENT_METHODS.map((m) => ({
            value: m.value,
            label: m.label,
            description: m.hint,
          }))}
        />

        {!hosted && selected === "CARD" && (
          <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
            <Input
              label="Name on card"
              name="cardName"
              autoComplete="cc-name"
              error={state.errors?.cardName}
            />
            <Input
              label="Card number"
              name="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              error={state.errors?.cardNumber}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Month"
                name="cardExpMonth"
                inputMode="numeric"
                placeholder="12"
                error={state.errors?.cardExpMonth}
              />
              <Input
                label="Year"
                name="cardExpYear"
                inputMode="numeric"
                placeholder="2030"
                error={state.errors?.cardExpYear}
              />
              <Input
                label="CVC"
                name="cardCvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                error={state.errors?.cardCvc}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="sm:w-auto sm:px-8"
        >
          {pending ? "Saving…" : "Save payment method"}
        </Button>
      </form>
    </div>
  );
}

export function CancelResumePanel({
  cancelAtPeriodEnd,
}: {
  cancelAtPeriodEnd: boolean;
}) {
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelSubscriptionAction,
    initial
  );
  const [resumeState, resumeAction, resuming] = useActionState(
    resumeSubscriptionAction,
    initial
  );

  return (
    <div className="flex flex-col gap-2">
      <Banner state={cancelState} />
      <Banner state={resumeState} />
      {cancelAtPeriodEnd ? (
        <form action={resumeAction}>
          <button
            type="submit"
            disabled={resuming}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            {resuming ? "Resuming…" : "Resume subscription"}
          </button>
        </form>
      ) : (
        <form
          action={cancelAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Cancel your subscription? Your hubs stay in your account and remain listed until the period ends."
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            disabled={cancelling}
            className="text-sm text-gray-500 hover:underline disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel subscription"}
          </button>
        </form>
      )}
      <p className="text-xs text-gray-400">
        Cancelling never deletes anything — your hubs and bookings stay in your
        account, they just stop being listed.
      </p>
    </div>
  );
}
