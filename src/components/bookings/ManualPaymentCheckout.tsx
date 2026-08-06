"use client";

import { useActionState, useState } from "react";

import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import {
  submitManualPaymentProofAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";
import type { ManualPaymentMethodView } from "@/lib/manual-payments";

const initialState: ManualPaymentFormState = {};

export function ManualPaymentCheckout({
  paymentId,
  amountLabel,
  expiresAt,
  initialSeconds,
  methods,
}: {
  paymentId: string;
  amountLabel: string;
  expiresAt: string;
  initialSeconds: number;
  methods: ManualPaymentMethodView[];
}) {
  const [state, action, pending] = useActionState(
    submitManualPaymentProofAction,
    initialState
  );
  const [selectedId, setSelectedId] = useState(methods[0]?.id ?? "");
  const selected = methods.find((method) => method.id === selectedId);

  if (state.success) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-xl text-white">✓</div>
        <h2 className="mt-3 text-lg font-black text-navy">Proof submitted</h2>
        <p className="mt-1 text-sm font-bold text-amber-800">Pending booking · venue review</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your slot is protected while the venue checks your receipt. We will
          update the booking after they approve or decline it.
        </p>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
        The venue has no active manual payment destination. Contact the venue
        before this hold expires.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="methodId" value={selectedId} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Upload deadline</p>
          <p className="mt-0.5 text-xs text-amber-800">Unpaid slots are released after 15 minutes.</p>
        </div>
        <HoldCountdown expiresAt={expiresAt} initialSeconds={initialSeconds} />
      </div>

      <section>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">1. Select payment network</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {methods.map((method) => (
            <button
              key={method.id}
              type="button"
              aria-pressed={selectedId === method.id}
              onClick={() => setSelectedId(method.id)}
              className={`rounded-2xl border p-4 text-left transition-colors ${selectedId === method.id ? "border-primary bg-primary-soft" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <span className="block font-bold text-navy">{method.label}</span>
              <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {method.network.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
        {state.errors?.methodId && <p className="mt-2 text-xs text-red-500">{state.errors.methodId}</p>}
      </section>

      {selected && (
        <section className="rounded-2xl border border-navy/10 bg-navy-soft p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-navy/50">2. Transfer exactly {amountLabel}</p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            {selected.qrImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.qrImage} alt={`${selected.label} payment QR`} className="size-40 rounded-2xl border border-slate-200 bg-white object-contain p-2" />
            )}
            <dl className="min-w-0 flex-1 space-y-3 text-sm">
              {selected.accountName && <Detail label="Account name" value={selected.accountName} />}
              {selected.accountIdentifier && <Detail label="Account details" value={selected.accountIdentifier} copy />}
              {selected.instructions && (
                <div>
                  <dt className="text-xs font-bold text-slate-500">Instructions</dt>
                  <dd className="mt-1 whitespace-pre-line leading-6 text-navy">{selected.instructions}</dd>
                </div>
              )}
            </dl>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">This is a direct manual transfer to the venue. No Bunal service fee or PayMongo processing fee is added.</p>
        </section>
      )}

      <section className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">3. Submit proof of payment</p>
        <ReceiptUpload error={state.errors?.receiptImage} />
        <label className="block text-sm font-medium text-slate-700">
          Transaction or reference number <span className="font-normal text-slate-400">(optional)</span>
          <input name="paymentReference" maxLength={120} placeholder="e.g. 0012 345 678901" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy" />
        </label>
      </section>

      {state.message && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-black text-white shadow-sm hover:bg-primary-hover disabled:opacity-50">
        {pending ? "Submitting proof…" : "Submit payment proof"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-400">After submission, the booking remains Pending until the venue reviews the receipt. Your reserved capacity stays protected during review.</p>
    </form>
  );
}

function Detail({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 break-all font-bold text-navy">
        {value}
        {copy && <button type="button" onClick={() => navigator.clipboard.writeText(value)} className="shrink-0 rounded-lg border border-navy/10 bg-white px-2 py-1 text-[10px] font-bold text-primary">Copy</button>}
      </dd>
    </div>
  );
}
