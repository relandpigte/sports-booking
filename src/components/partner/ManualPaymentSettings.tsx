"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ManualPaymentNetwork, PartnerPaymentMode } from "@prisma/client";

import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import { GatewayPanel } from "@/components/partner/GatewayPanel";
import { Badge } from "@/components/ui/Badge";
import {
  saveManualPaymentMethodAction,
  savePartnerPaymentModeAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";
import type { ManualPaymentMethodView } from "@/lib/manual-payments";
import type { GatewayView } from "@/lib/partner-gateway";
import {
  MANUAL_SERVICE_FEE_PERCENT,
  SERVICE_FEE_PERCENT,
} from "@/lib/constants";

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

function ModeActivation({
  mode,
  activeMode,
}: {
  mode: PartnerPaymentMode;
  activeMode: PartnerPaymentMode;
}) {
  const [state, action, pending] = useActionState(
    savePartnerPaymentModeAction,
    initialState
  );
  const active = mode === activeMode;

  return (
    <form
      action={action}
      className="rounded-2xl border border-primary/20 bg-primary-soft/60 p-4"
    >
      <input type="hidden" name="mode" value={mode} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-navy">
            {active
              ? "This is your active checkout mode"
              : `Ready to use ${mode === "MANUAL" ? "Manual" : "Automatic"} checkout?`}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {active
              ? "Changes to the settings above apply without switching modes."
              : "Activation applies to new court bookings, paid event registrations, and paid guest add-ons."}
          </p>
        </div>
        {active ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <button
            disabled={pending}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending
              ? "Activating…"
              : `Activate ${mode === "MANUAL" ? "manual" : "automatic"} checkout`}
          </button>
        )}
      </div>
      <div className="mt-3">
        <Result state={state} />
      </div>
    </form>
  );
}

function MethodFields({
  method,
  state,
}: {
  method?: ManualPaymentMethodView;
  state: ManualPaymentFormState;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Network
          <select
            name="network"
            defaultValue={method?.network ?? "GCASH"}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy"
          >
            {networkOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {state.errors?.network && (
            <span className="mt-1 block text-xs text-red-500">
              {state.errors.network}
            </span>
          )}
        </label>
        <Field
          label="Display label"
          name="label"
          defaultValue={method?.label ?? ""}
          error={state.errors?.label}
          placeholder="e.g. GCash business account"
        />
        <Field
          label="Account name"
          name="accountName"
          defaultValue={method?.accountName ?? ""}
          placeholder="Venue or account holder"
        />
        <Field
          label="Account number / bank details"
          name="accountIdentifier"
          defaultValue={method?.accountIdentifier ?? ""}
          error={state.errors?.accountIdentifier}
          placeholder="Mobile number or bank account"
        />
      </div>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Instructions
        <textarea
          name="instructions"
          defaultValue={method?.instructions ?? ""}
          rows={3}
          placeholder="Exact transfer steps or reference format"
          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy"
        />
      </label>
      <div className="mt-4">
        <ReceiptUpload
          name="qrImage"
          label="Payment QR code"
          initialValue={method?.qrImage ?? ""}
          required={false}
          error={state.errors?.qrImage}
        />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={method?.active ?? true}
        />
        Show this method to players
      </label>
    </>
  );
}

function MethodForm({ method }: { method: ManualPaymentMethodView }) {
  const [state, action, pending] = useActionState(
    saveManualPaymentMethodAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  if (!open) {
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
      <input type="hidden" name="id" value={method.id} />
      <MethodFields method={method} state={state} />
      <div className="mt-4 space-y-3">
        <Result state={state} />
        <div className="flex gap-2">
          <button disabled={pending} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            {pending ? "Saving…" : "Save method"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </form>
  );
}

function AddMethodModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(
    saveManualPaymentMethodAction,
    initialState
  );
  const networkRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    networkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, pending]);

  useEffect(() => {
    if (state.success) onClose();
  }, [onClose, state.success]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-payment-network-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2
              id="add-payment-network-title"
              className="text-lg font-bold text-navy"
            >
              Add payment network
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Provide the account details players should use for transfers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close add payment network dialog"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <label className="text-sm font-medium text-slate-700">
            Network
            <select
              ref={networkRef}
              name="network"
              defaultValue="GCASH"
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy"
            >
              {networkOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {state.errors?.network && (
              <span className="mt-1 block text-xs text-red-500">
                {state.errors.network}
              </span>
            )}
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Display label"
              name="label"
              defaultValue=""
              error={state.errors?.label}
              placeholder="e.g. GCash business account"
            />
            <Field
              label="Account name"
              name="accountName"
              defaultValue=""
              placeholder="Venue or account holder"
            />
            <div className="sm:col-span-2">
              <Field
                label="Account number / bank details"
                name="accountIdentifier"
                defaultValue=""
                error={state.errors?.accountIdentifier}
                placeholder="Mobile number or bank account"
              />
            </div>
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Instructions
            <textarea
              name="instructions"
              rows={3}
              placeholder="Exact transfer steps or reference format"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy"
            />
          </label>
          <div className="mt-4">
            <ReceiptUpload
              name="qrImage"
              label="Payment QR code"
              required={false}
              error={state.errors?.qrImage}
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="active" defaultChecked />
            Show this method to players
          </label>
          <div className="mt-4">
            <Result state={state} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add payment network"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddMethodControl() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeModal() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-navy hover:bg-slate-50 sm:w-auto"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="text-primary"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        Add payment network
      </button>
      {open && <AddMethodModal onClose={closeModal} />}
    </>
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

export function CheckoutModeSettings({
  mode,
  methods,
  gateway,
}: {
  mode: PartnerPaymentMode;
  methods: ManualPaymentMethodView[];
  gateway: GatewayView | null;
}) {
  const [selectedMode, setSelectedMode] = useState<PartnerPaymentMode>(mode);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold text-navy">Checkout mode</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Select a mode to manage its settings. Viewing a tab does not change
          the checkout players currently use.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Checkout mode settings">
          <button
            type="button"
            role="tab"
            id="automatic-settings-tab"
            aria-controls="automatic-settings-panel"
            aria-selected={selectedMode === "AUTOMATIC"}
            onClick={() => setSelectedMode("AUTOMATIC")}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selectedMode === "AUTOMATIC"
                ? "border-primary bg-primary-soft"
                : "border-slate-200 hover:border-primary/40 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-navy">Automatic · PayMongo QR Ph</span>
              {mode === "AUTOMATIC" && <Badge tone="success">Active</Badge>}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {SERVICE_FEE_PERCENT}% Bunal fee plus PayMongo processing. Successful payments confirm automatically.
            </span>
          </button>
          <button
            type="button"
            role="tab"
            id="manual-settings-tab"
            aria-controls="manual-settings-panel"
            aria-selected={selectedMode === "MANUAL"}
            onClick={() => setSelectedMode("MANUAL")}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selectedMode === "MANUAL"
                ? "border-primary bg-primary-soft"
                : "border-slate-200 hover:border-primary/40 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-navy">Manual · Your payment networks</span>
              {mode === "MANUAL" && <Badge tone="success">Active</Badge>}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              Players upload a receipt in 15 minutes. A {MANUAL_SERVICE_FEE_PERCENT}% Bunal fee applies; no PayMongo processing fee.
            </span>
          </button>
        </div>
      </section>

      <div
        id="automatic-settings-panel"
        role="tabpanel"
        aria-labelledby="automatic-settings-tab"
        hidden={selectedMode !== "AUTOMATIC"}
        className="space-y-4"
      >
        <GatewayPanel gateway={gateway} />
        <ModeActivation mode="AUTOMATIC" activeMode={mode} />
      </div>

      <div
        id="manual-settings-panel"
        role="tabpanel"
        aria-labelledby="manual-settings-tab"
        hidden={selectedMode !== "MANUAL"}
        className="space-y-4"
      >
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-navy">Manual payment networks</h2>
              <p className="mt-1 text-sm text-slate-500">Add as many destinations as you accept. Players choose one during checkout.</p>
            </div>
            <AddMethodControl />
          </div>
          {methods.map((method) => <MethodForm key={method.id} method={method} />)}
        </section>
        <ModeActivation mode="MANUAL" activeMode={mode} />
      </div>
    </div>
  );
}
