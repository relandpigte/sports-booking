"use client";

import { useActionState, useState } from "react";
import type { PayoutNetwork } from "@prisma/client";

import { Badge } from "@/components/ui/Badge";
import type { PayoutAccountFormState } from "@/lib/payout-actions";

const initialState: PayoutAccountFormState = {};

const NETWORKS: { value: PayoutNetwork; label: string }[] = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
];

export type PayoutAccountPanelAccount = {
  network: PayoutNetwork;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
};

// Where Bunal.club sends a venue's or trainer's share of automatic payments.
// The same panel serves both; the page passes the action for its own account.
export function PayoutAccountPanel({
  account,
  action,
  earner,
  readOnly = false,
  readOnlyReason,
}: {
  account: PayoutAccountPanelAccount | null;
  action: (
    state: PayoutAccountFormState,
    formData: FormData
  ) => Promise<PayoutAccountFormState>;
  // Who earns the money, for the copy: "court and event" or "session".
  earner: "venue" | "trainer";
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [network, setNetwork] = useState<PayoutNetwork>(
    (state.values?.network as PayoutNetwork | undefined) ??
      account?.network ??
      "GCASH"
  );
  const bank = network === "BANK_TRANSFER";
  const value = (key: "bankName" | "accountName" | "accountNumber") =>
    state.values?.[key] ?? account?.[key] ?? "";

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy">Payout account</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Players pay Bunal.club by QR Ph, and Bunal.club sends your{" "}
            {earner === "venue" ? "court and event" : "session"} earnings here
            every Monday and Thursday. You do not need a PayMongo account.
          </p>
        </div>
        <Badge tone={account ? "success" : "warn"}>
          {account ? "On file" : "Needs setup"}
        </Badge>
      </div>

      {readOnly ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm">
          {account ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Sent to
                </dt>
                <dd className="mt-1 font-bold text-navy">
                  {account.network === "BANK_TRANSFER"
                    ? (account.bankName ?? "Bank transfer")
                    : NETWORKS.find((item) => item.value === account.network)
                        ?.label}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Account name
                </dt>
                <dd className="mt-1 font-bold text-navy">{account.accountName}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Account number
                </dt>
                <dd className="mt-1 font-bold text-navy">
                  •••• {account.accountNumber.slice(-4)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-slate-600">No payout account has been added yet.</p>
          )}
          {readOnlyReason && (
            <p className="mt-3 text-xs leading-5 text-slate-500">{readOnlyReason}</p>
          )}
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Send payouts by
              <select
                name="network"
                value={network}
                onChange={(event) =>
                  setNetwork(event.target.value as PayoutNetwork)
                }
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy"
              >
                {NETWORKS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {state.errors?.network && (
                <span className="mt-1 block text-xs text-red-500">
                  {state.errors.network}
                </span>
              )}
            </label>
            {bank && (
              <label className="text-sm font-medium text-slate-700">
                Bank name
                <input
                  name="bankName"
                  defaultValue={value("bankName")}
                  placeholder="BDO, BPI, UnionBank…"
                  maxLength={80}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy"
                />
                {state.errors?.bankName && (
                  <span className="mt-1 block text-xs text-red-500">
                    {state.errors.bankName}
                  </span>
                )}
              </label>
            )}
            <label className="text-sm font-medium text-slate-700">
              Account name
              <input
                name="accountName"
                defaultValue={value("accountName")}
                placeholder="Exactly as registered"
                maxLength={120}
                autoComplete="off"
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy"
              />
              {state.errors?.accountName && (
                <span className="mt-1 block text-xs text-red-500">
                  {state.errors.accountName}
                </span>
              )}
            </label>
            <label className="text-sm font-medium text-slate-700">
              {bank ? "Account number" : "Mobile number"}
              <input
                name="accountNumber"
                defaultValue={value("accountNumber")}
                placeholder={bank ? "Account number" : "09XXXXXXXXX"}
                inputMode="numeric"
                maxLength={40}
                autoComplete="off"
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy"
              />
              {state.errors?.accountNumber && (
                <span className="mt-1 block text-xs text-red-500">
                  {state.errors.accountNumber}
                </span>
              )}
            </label>
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            Each payout covers every payment received up to the end of the day
            before. If a booking is refunded after its payout was sent, that
            amount is deducted from your next payout. Changing this account
            also redirects any payout that has not been sent yet.
          </p>

          {(state.success ?? state.message) && (
            <p
              role={state.success ? "status" : "alert"}
              className={`rounded-xl px-3 py-2.5 text-sm ${
                state.success
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {state.success ?? state.message}
            </p>
          )}

          <button
            disabled={pending}
            className="min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending
              ? "Saving…"
              : account
                ? "Update payout account"
                : "Save payout account"}
          </button>
        </form>
      )}
    </section>
  );
}
