"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { RadioCards } from "@/components/ui/RadioCards";
import { registerPartnerAction, type AuthFormState } from "@/lib/actions";
import { formatPHP } from "@/lib/currency";
import { PAYMENT_METHODS, TRIAL_DAYS } from "@/lib/constants";
import type { PlanView } from "@/lib/billing";

const initialState: AuthFormState = {};

export function PartnerRegisterForm({ plans }: { plans: PlanView[] }) {
  const [state, formAction, pending] = useActionState(
    registerPartnerAction,
    initialState
  );
  const [planKey, setPlanKey] = useState<string>(plans[0]?.key ?? "STARTER");
  const [method, setMethod] = useState<string>("CARD");
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

      <div className="mt-6 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-gray-800">Choose a plan</span>
          <span className="text-xs text-gray-400">Unlimited hubs on every plan</span>
        </div>
        <RadioCards
          name="planKey"
          value={planKey}
          onChange={setPlanKey}
          error={state.errors?.planKey}
          columns={3}
          options={plans.map((plan) => ({
            value: plan.key,
            label: plan.name,
            meta: `${formatPHP(plan.priceMonthly)}/mo`,
            description:
              plan.maxCourts == null
                ? "Unlimited courts"
                : `Up to ${plan.maxCourts} courts`,
          }))}
        />
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          {`${TRIAL_DAYS} days free — you won't be charged today.`}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-800">
          How you&apos;ll pay after the trial
        </span>
        <RadioCards
          name="paymentMethod"
          value={method}
          onChange={setMethod}
          error={state.errors?.paymentMethod}
          options={PAYMENT_METHODS.map((m) => ({
            value: m.value,
            label: m.label,
            description: m.hint,
          }))}
        />
      </div>

      {method === "CARD" && (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">
            We&apos;ll save your card for future renewals. Nothing is charged
            until your trial ends.
          </p>
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
        {pending ? "Creating account…" : `Start ${TRIAL_DAYS}-day free trial`}
      </Button>
    </form>
  );
}

