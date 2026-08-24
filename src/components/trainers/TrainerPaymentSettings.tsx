"use client";

import type { ManualPaymentNetwork } from "@prisma/client";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PaymentWorkspace } from "@/components/partner/PaymentWorkspace";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPHP } from "@/lib/currency";
import {
  connectTrainerGatewayAction,
  deleteTrainerManualMethodAction,
  saveTrainerManualMethodAction,
  saveTrainerPaymentModeAction,
  submitTrainerServiceFeeSettlementAction,
  type TrainerPaymentState,
} from "@/lib/trainer-payment-actions";

const initial: TrainerPaymentState = {};

type PaymentMode = "AUTOMATIC" | "MANUAL";

type TrainerGatewayView = {
  accountLabel: string | null;
  disconnectedAt: Date | null;
} | null;

type TrainerManualMethodView = {
  id: string;
  label: string;
  network: ManualPaymentNetwork;
  active: boolean;
  accountName: string | null;
  accountIdentifier: string | null;
  instructions: string | null;
  qrImage: string | null;
};

const trainerNetworkOptions: Array<{
  value: ManualPaymentNetwork;
  label: string;
}> = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other / custom" },
];

type TrainerServiceFeeView = {
  accrued: number;
  pending: number;
  paid: number;
  due: number;
  overdue: number;
  blocked: boolean;
  inEnforcementGrace: boolean;
  dueAt: string | null;
  enforcementAt: string | null;
  settlements: Array<{
    id: string;
    amount: number;
    status: string;
    submittedAt: string;
  }>;
};

function Result({ state }: { state: TrainerPaymentState }) {
  const message = state.success ?? state.message;
  if (!message) return null;

  return (
    <p
      role={state.success ? "status" : "alert"}
      className={`mt-3 rounded-xl p-3 text-sm ${
        state.success
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {message}
    </p>
  );
}

export function TrainerPaymentSettings({
  mode,
  gateway,
  methods,
  serviceFees,
  settlementInstructions,
}: {
  mode: PaymentMode;
  gateway: TrainerGatewayView;
  methods: TrainerManualMethodView[];
  serviceFees: TrainerServiceFeeView;
  settlementInstructions: string;
}) {
  const connected = Boolean(gateway && !gateway.disconnectedAt);
  const activeManualMethods = methods.filter((method) => method.active).length;
  const checkoutReady =
    mode === "AUTOMATIC" ? connected : activeManualMethods > 0;
  const settlementStatus =
    serviceFees.blocked
      ? { value: "Requests paused", tone: "warning" as const }
      : serviceFees.inEnforcementGrace
        ? { value: "3-day grace", tone: "warning" as const }
        : serviceFees.pending > 0
          ? { value: "Under review", tone: "warning" as const }
          : serviceFees.due > 0
            ? { value: "Payment due", tone: "warning" as const }
            : { value: "Current", tone: "success" as const };

  return (
    <PaymentWorkspace
      initialTab="checkout"
      settlementFirst
      summary={[
        {
          label: "Checkout mode",
          value: mode === "AUTOMATIC" ? "Automatic QR Ph" : "Manual transfer",
          detail: "Used for new trainer sessions",
          tone: "default",
        },
        {
          label: "Payment destination",
          value:
            mode === "AUTOMATIC"
              ? connected
                ? "PayMongo connected"
                : "Needs setup"
              : activeManualMethods > 0
                ? `${activeManualMethods} active destination${activeManualMethods === 1 ? "" : "s"}`
                : "Needs setup",
          detail: checkoutReady
            ? "Ready to receive player payments"
            : "Complete setup before accepting payments",
          tone: checkoutReady ? "success" : "warning",
        },
        {
          label: "Service-fee balance",
          value: formatPHP(serviceFees.due),
          detail:
            serviceFees.pending > 0
              ? `${formatPHP(serviceFees.pending)} under review`
              : `${formatPHP(serviceFees.paid)} settled`,
          tone: serviceFees.due > 0 ? "warning" : "default",
        },
        {
          label: "Settlement status",
          value: settlementStatus.value,
          detail:
            serviceFees.blocked
              ? "Settle the overdue balance to resume requests"
              : serviceFees.inEnforcementGrace && serviceFees.enforcementAt
                ? `Requests pause ${formatSettlementDate(serviceFees.enforcementAt)}`
                : serviceFees.pending > 0
                  ? "Payment proof awaiting review"
                  : serviceFees.due > 0
                    ? "Submit settlement payment"
                    : "No payment under review",
          tone: settlementStatus.tone,
        },
      ]}
      checkout={
        <TrainerCheckoutConfiguration
          mode={mode}
          gateway={gateway}
          methods={methods}
        />
      }
      settlement={
        <TrainerSettlementPanel
          serviceFees={serviceFees}
          settlementInstructions={settlementInstructions}
        />
      }
    />
  );
}

function TrainerCheckoutConfiguration({
  mode,
  gateway,
  methods,
}: {
  mode: PaymentMode;
  gateway: TrainerGatewayView;
  methods: TrainerManualMethodView[];
}) {
  const [selectedMode, setSelectedMode] = useState<PaymentMode>(mode);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy">
              Checkout configuration
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Choose a mode to review its setup. Switching views does not
              activate it.
            </p>
          </div>
          <div
            className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto"
            role="tablist"
            aria-label="Trainer checkout mode settings"
          >
            <ModeTab
              mode="AUTOMATIC"
              selectedMode={selectedMode}
              activeMode={mode}
              onSelect={setSelectedMode}
            >
              Automatic
            </ModeTab>
            <ModeTab
              mode="MANUAL"
              selectedMode={selectedMode}
              activeMode={mode}
              onSelect={setSelectedMode}
            >
              Manual
            </ModeTab>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
          {selectedMode === "AUTOMATIC"
            ? "3% Bunal fee plus PayMongo processing. Successful payments confirm automatically."
            : "Players upload a receipt for your review. A 3% Bunal fee applies with no PayMongo processing fee."}
        </p>
      </section>

      <div
        id="trainer-automatic-settings-panel"
        role="tabpanel"
        aria-labelledby="trainer-automatic-settings-tab"
        hidden={selectedMode !== "AUTOMATIC"}
        className="space-y-3"
      >
        <TrainerAutomaticSettings mode={mode} gateway={gateway} />
      </div>

      <div
        id="trainer-manual-settings-panel"
        role="tabpanel"
        aria-labelledby="trainer-manual-settings-tab"
        hidden={selectedMode !== "MANUAL"}
        className="space-y-3"
      >
        <TrainerManualSettings mode={mode} methods={methods} />
      </div>
    </div>
  );
}

function ModeTab({
  mode,
  selectedMode,
  activeMode,
  onSelect,
  children,
}: {
  mode: PaymentMode;
  selectedMode: PaymentMode;
  activeMode: PaymentMode;
  onSelect: (mode: PaymentMode) => void;
  children: ReactNode;
}) {
  const selected = selectedMode === mode;
  const id =
    mode === "AUTOMATIC"
      ? "trainer-automatic-settings-tab"
      : "trainer-manual-settings-tab";
  const controls =
    mode === "AUTOMATIC"
      ? "trainer-automatic-settings-panel"
      : "trainer-manual-settings-panel";

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={selected}
      onClick={() => onSelect(mode)}
      className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-all sm:flex-none sm:px-4 ${
        selected
          ? "bg-white text-navy shadow-sm"
          : "text-slate-500 hover:text-navy"
      }`}
    >
      {children}
      {activeMode === mode && (
        <span className="size-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

function TrainerAutomaticSettings({
  mode,
  gateway,
}: {
  mode: PaymentMode;
  gateway: TrainerGatewayView;
}) {
  const [state, action, connecting] = useActionState(
    connectTrainerGatewayAction,
    initial
  );
  const connected = Boolean(gateway && !gateway.disconnectedAt);

  return (
    <>
      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">
              Automatic payments · PayMongo
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Players pay your account directly. The 3% Bunal fee is tracked
              for remittance.
            </p>
          </div>
          {connected && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
              Connected
            </span>
          )}
        </div>

        {connected ? (
          <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Account
              </p>
              <p className="mt-2 text-sm font-bold text-navy">
                {gateway?.accountLabel ?? "PayMongo"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Secure webhook confirmations are active for trainer-session
                payments.
              </p>
            </div>
            <div className="rounded-xl border border-ocean/20 bg-ocean-soft p-4">
              <p className="text-sm font-bold text-navy">
                QR Ph-only checkout
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Player payments confirm automatically after PayMongo processes
                the QR.
              </p>
            </div>
          </div>
        ) : (
          <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="provider" value="paymongo" />
            <Input
              label="Publishable key"
              name="publicKey"
              required
              error={state.errors?.publicKey}
              placeholder="pk_test_…"
            />
            <Input
              label="Secret key"
              name="secretKey"
              type="password"
              required
              error={state.errors?.secretKey}
              placeholder="sk_test_…"
            />
            <div className="sm:col-span-2">
              <Input
                label="Existing webhook secret (optional)"
                name="webhookSecret"
                type="password"
                error={state.errors?.webhookSecret}
              />
            </div>
            <Button disabled={connecting} className="sm:w-auto">
              {connecting ? "Connecting…" : "Connect PayMongo"}
            </Button>
          </form>
        )}
        <Result state={state} />
      </section>
      <ModeActivation mode="AUTOMATIC" activeMode={mode} />
    </>
  );
}

function TrainerManualSettings({
  mode,
  methods,
}: {
  mode: PaymentMode;
  methods: TrainerManualMethodView[];
}) {
  return (
    <>
      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy">
              Manual payment networks
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Add as many destinations as you accept. Players choose one
              during checkout.
            </p>
          </div>
          <TrainerAddMethodControl />
        </div>

        <div className="mt-4 space-y-3">
          {methods.length > 0 ? (
            methods.map((method) => (
              <TrainerMethodForm key={method.id} method={method} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-navy">
                No manual payment networks yet
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Add a destination before activating Manual checkout.
              </p>
            </div>
          )}
        </div>
      </section>
      <ModeActivation mode="MANUAL" activeMode={mode} />
    </>
  );
}

function TrainerMethodForm({
  method,
}: {
  method: TrainerManualMethodView;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveTrainerManualMethodAction,
    initial
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteTrainerManualMethodAction,
    initial
  );
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <form
        action={saveAction}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <input type="hidden" name="id" value={method.id} />
        <TrainerManualMethodFields method={method} state={saveState} />
        <div className="mt-4 space-y-3">
          <Result state={saveState} />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save destination"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {method.qrImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={method.qrImage}
            alt=""
            className="size-16 rounded-xl border border-slate-200 object-contain"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-navy-soft text-xs font-black text-navy">
            QR
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-navy">{method.label}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                method.active
                  ? "bg-green-50 text-green-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {method.active ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {[method.accountName, method.accountIdentifier]
              .filter(Boolean)
              .join(" · ") || "Instructions only"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
              setEditing(true);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-navy hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-expanded={confirmingDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div
          role="alertdialog"
          aria-label={`Delete ${method.label}`}
          className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3.5"
        >
          <p className="text-sm font-bold text-red-700">
            Delete {method.label}?
          </p>
          <p className="mt-1 text-xs leading-5 text-red-600">
            Players cannot select it for new sessions. Existing payment records
            keep their saved destination details.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={deleteAction}>
              <input type="hidden" name="id" value={method.id} />
              <button
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          <Result state={deleteState} />
        </div>
      )}
    </div>
  );
}

function TrainerManualMethodFields({
  method,
  state,
}: {
  method?: TrainerManualMethodView;
  state: TrainerPaymentState;
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
            {trainerNetworkOptions.map((option) => (
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
        <TrainerManualField
          label="Display label"
          name="label"
          defaultValue={method?.label ?? ""}
          error={state.errors?.label}
          placeholder="e.g. GCash business account"
        />
        <TrainerManualField
          label="Account name"
          name="accountName"
          defaultValue={method?.accountName ?? ""}
          placeholder="Trainer or account holder"
        />
        <TrainerManualField
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
          variant="qr"
          error={state.errors?.qrImage}
        />
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          Upload a clear image centered on the QR code. Full payment-app
          screenshots are automatically cropped to improve scanning.
        </p>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={method?.active ?? true}
        />
        Show this destination to players
      </label>
    </>
  );
}

function TrainerAddMethodModal({ onClose }: { onClose: () => void }) {
  const [state, action, adding] = useActionState(
    saveTrainerManualMethodAction,
    initial
  );
  const networkRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    networkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !adding) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [adding, onClose]);

  useEffect(() => {
    if (state.success) onClose();
  }, [onClose, state.success]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !adding) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-trainer-payment-network-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2
              id="add-trainer-payment-network-title"
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
            disabled={adding}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Network
              <select
                ref={networkRef}
                name="network"
                defaultValue="GCASH"
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy"
              >
                {trainerNetworkOptions.map((option) => (
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
            <TrainerManualField
              label="Display label"
              name="label"
              defaultValue=""
              error={state.errors?.label}
              placeholder="e.g. GCash business account"
            />
            <TrainerManualField
              label="Account name"
              name="accountName"
              defaultValue=""
              placeholder="Trainer or account holder"
            />
            <TrainerManualField
              label="Account number / bank details"
              name="accountIdentifier"
              defaultValue=""
              error={state.errors?.accountIdentifier}
              placeholder="Mobile number or bank account"
            />
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
              variant="qr"
              error={state.errors?.qrImage}
            />
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              Upload a clear image centered on the QR code. Full payment-app
              screenshots are automatically cropped to improve scanning.
            </p>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="active" defaultChecked />
            Show this destination to players
          </label>
          <Result state={state} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={adding}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add payment network"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TrainerAddMethodControl() {
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
      {open && <TrainerAddMethodModal onClose={closeModal} />}
    </>
  );
}

function TrainerManualField({
  label,
  name,
  defaultValue,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  error?: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy"
      />
      {error && (
        <span className="mt-1 block text-xs text-red-500">{error}</span>
      )}
    </label>
  );
}

function ModeActivation({
  mode,
  activeMode,
}: {
  mode: PaymentMode;
  activeMode: PaymentMode;
}) {
  const [state, action, pending] = useActionState(
    saveTrainerPaymentModeAction,
    initial
  );
  const active = mode === activeMode;
  const modeLabel = mode === "AUTOMATIC" ? "Automatic" : "Manual";

  return (
    <section
      className={`rounded-2xl border px-4 py-4 sm:px-5 ${
        active
          ? "border-green-200 bg-green-50"
          : "border-[#dfe7e2] bg-white shadow-sm shadow-navy/5"
      }`}
    >
      <form
        action={action}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <input type="hidden" name="mode" value={mode} />
        <div>
          <p className="text-sm font-bold text-navy">
            {active
              ? "This is your active checkout mode"
              : `Use ${modeLabel.toLowerCase()} checkout`}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {active
              ? "Changes to the settings above apply without switching modes."
              : `New trainer sessions will use ${modeLabel.toLowerCase()} payment after activation.`}
          </p>
        </div>
        {active ? (
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-primary">
            Active
          </span>
        ) : (
          <Button disabled={pending} className="sm:w-auto">
            {pending ? "Activating…" : `Activate ${modeLabel}`}
          </Button>
        )}
      </form>
      <Result state={state} />
    </section>
  );
}

function TrainerSettlementPanel({
  serviceFees,
  settlementInstructions,
}: {
  serviceFees: TrainerServiceFeeView;
  settlementInstructions: string;
}) {
  const [state, action, settling] = useActionState(
    submitTrainerServiceFeeSettlementAction,
    initial
  );

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy">
            Bunal.club service-fee settlement
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            The 3% added to paid sessions is collected in your account and
            remitted here.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-black ${
            serviceFees.due > 0
              ? "bg-amber-50 text-amber-700"
              : "bg-green-50 text-primary"
          }`}
        >
          {formatPHP(serviceFees.due)} due
        </span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <SettlementMetric label="Accrued" value={serviceFees.accrued} />
        <SettlementMetric label="Under review" value={serviceFees.pending} />
        <SettlementMetric label="Settled" value={serviceFees.paid} />
      </dl>

      {serviceFees.due > 0 && serviceFees.dueAt && (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            serviceFees.blocked
              ? "border-red-200 bg-red-50 text-red-700"
              : serviceFees.inEnforcementGrace
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <p className="font-bold">
            {serviceFees.blocked
              ? "New trainer-session requests are paused"
              : serviceFees.inEnforcementGrace
                ? "Your balance is in the 3-day grace period"
                : `Payment is due ${formatSettlementDate(serviceFees.dueAt)}`}
          </p>
          <p className="mt-1 leading-5">
            {serviceFees.blocked
              ? "Your public trainer listing and new requests resume automatically after the settlement is approved."
              : serviceFees.inEnforcementGrace && serviceFees.enforcementAt
                ? `Settle by ${formatSettlementDate(serviceFees.enforcementAt)} to keep your public listing and new requests active.`
                : "You can continue accepting requests until the deadline and the following three-day grace period end."}
          </p>
        </div>
      )}

      {serviceFees.due > 0 && serviceFees.pending === 0 && (
        <form action={action} className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="mb-4 text-xs leading-5 text-slate-600">
            {settlementInstructions}
          </p>
          <Input
            label="Transfer reference"
            name="paymentReference"
            required
            error={state.errors?.paymentReference}
          />
          <div className="mt-3">
            <ReceiptUpload error={state.errors?.receiptImage} />
          </div>
          <Button disabled={settling} className="mt-3 sm:w-auto">
            {settling
              ? "Submitting…"
              : `Submit ${formatPHP(serviceFees.due)} settlement`}
          </Button>
          <Result state={state} />
        </form>
      )}

      {serviceFees.settlements.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Recent settlements
          </p>
          <div className="divide-y divide-slate-100">
            {serviceFees.settlements.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-navy">
                    {formatPHP(item.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(item.submittedAt).toLocaleDateString("en-PH")}
                  </p>
                </div>
                <strong className="text-xs text-slate-500">
                  {item.status.replaceAll("_", " ")}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SettlementMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-black text-navy">{formatPHP(value)}</dd>
    </div>
  );
}

function formatSettlementDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
