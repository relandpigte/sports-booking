"use client";

import { useActionState, useState } from "react";
import type { ManualPaymentNetwork, PartnerPaymentMode } from "@prisma/client";

import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import {
  saveManualPaymentMethodAction,
  savePartnerPaymentModeAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";
import type { ManualPaymentMethodView } from "@/lib/manual-payments";

const initialState: ManualPaymentFormState = {};

const networkOptions: { value: ManualPaymentNetwork; label: string }[] = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other / custom" },
];

function Result({ state }: { state: ManualPaymentFormState }) {
  const message = state.success ?? state.message;
  if (!message) return null;
  return (
    <p
      role={state.success ? "status" : "alert"}
      className={`rounded-xl px-3 py-2.5 text-sm ${
        state.success
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {message}
    </p>
  );
}

function ModeForm({ mode }: { mode: PartnerPaymentMode }) {
  const [state, action, pending] = useActionState(
    savePartnerPaymentModeAction,
    initialState
  );
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-navy">Checkout mode</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          This setting applies to every new court booking, paid event registration,
          and paid guest add-on across your account.
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="cursor-pointer rounded-2xl border border-slate-200 p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
          <input type="radio" name="mode" value="AUTOMATIC" defaultChecked={mode === "AUTOMATIC"} className="sr-only" />
          <span className="font-bold text-navy">Automatic · PayMongo QR Ph</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Bunal and PayMongo fees apply. Successful payments confirm automatically.
          </span>
        </label>
        <label className="cursor-pointer rounded-2xl border border-slate-200 p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
          <input type="radio" name="mode" value="MANUAL" defaultChecked={mode === "MANUAL"} className="sr-only" />
          <span className="font-bold text-navy">Manual · Your payment networks</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Players upload a receipt in 15 minutes. You review it; no Bunal or PayMongo fee is added.
          </span>
        </label>
      </div>
      <div className="mt-4 space-y-3">
        <Result state={state} />
        <button disabled={pending} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {pending ? "Saving…" : "Save checkout mode"}
        </button>
      </div>
    </form>
  );
}

function MethodForm({ method }: { method?: ManualPaymentMethodView }) {
  const [state, action, pending] = useActionState(
    saveManualPaymentMethodAction,
    initialState
  );
  const [open, setOpen] = useState(!method);
  if (!open && method) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        {method.qrImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={method.qrImage} alt="" className="size-16 rounded-xl border border-slate-200 object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-xl bg-navy-soft text-xs font-black text-navy">QR</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-navy">{method.label}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${method.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {method.active ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {[method.accountName, method.accountIdentifier].filter(Boolean).join(" · ") || "Instructions only"}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-navy hover:bg-slate-50">
          Edit
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      {method && <input type="hidden" name="id" value={method.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Network
          <select name="network" defaultValue={method?.network ?? "GCASH"} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy">
            {networkOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {state.errors?.network && <span className="mt-1 block text-xs text-red-500">{state.errors.network}</span>}
        </label>
        <Field label="Display label" name="label" defaultValue={method?.label ?? ""} error={state.errors?.label} placeholder="e.g. GCash business account" />
        <Field label="Account name" name="accountName" defaultValue={method?.accountName ?? ""} placeholder="Venue or account holder" />
        <Field label="Account number / bank details" name="accountIdentifier" defaultValue={method?.accountIdentifier ?? ""} error={state.errors?.accountIdentifier} placeholder="Mobile number or bank account" />
      </div>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Instructions
        <textarea name="instructions" defaultValue={method?.instructions ?? ""} rows={3} placeholder="Exact transfer steps or reference format" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy" />
      </label>
      <div className="mt-4">
        <ReceiptUpload name="qrImage" label="Payment QR code" initialValue={method?.qrImage ?? ""} required={false} error={state.errors?.qrImage} />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" name="active" defaultChecked={method?.active ?? true} />
        Show this method to players
      </label>
      <div className="mt-4 space-y-3">
        <Result state={state} />
        <div className="flex gap-2">
          <button disabled={pending} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            {pending ? "Saving…" : method ? "Save method" : "Add method"}
          </button>
          {method && <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">Cancel</button>}
        </div>
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue, placeholder, error }: { label: string; name: string; defaultValue: string; placeholder: string; error?: string }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy" />
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}

export function ManualPaymentSettings({ mode, methods }: { mode: PartnerPaymentMode; methods: ManualPaymentMethodView[] }) {
  return (
    <div className="space-y-5">
      <ModeForm mode={mode} />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-navy">Manual payment networks</h2>
          <p className="mt-1 text-sm text-slate-500">Add as many destinations as you accept. Players choose one during checkout.</p>
        </div>
        {methods.map((method) => <MethodForm key={method.id} method={method} />)}
        <MethodForm />
      </section>
    </div>
  );
}
