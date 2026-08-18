"use client";

import { useActionState, useEffect, useState } from "react";

import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import {
  submitManualPaymentProofAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";
import { MANUAL_SERVICE_FEE_PERCENT } from "@/lib/constants";
import { focusQrImageBlob } from "@/lib/image";
import type { ManualPaymentMethodView } from "@/lib/manual-payments";

const initialState: ManualPaymentFormState = {};

async function submitProofWithUploadFallback(
  previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  try {
    return await submitManualPaymentProofAction(previous, formData);
  } catch {
    return {
      message:
        "We couldn't upload the receipt. Check your connection and try again with a smaller image.",
    };
  }
}

export type ManualPaymentCheckoutSummary = {
  venueName: string;
  venueHref: string;
  venuePhone: string | null;
  venueEmail: string | null;
  lines: Array<{
    id: string;
    label: string;
    detail: string;
    quantity: string;
  }>;
  venueAmountLabel: string;
  serviceFeeLabel: string | null;
  totalLabel: string;
};

export function ManualPaymentCheckout({
  paymentId,
  amountLabel,
  expiresAt,
  initialSeconds,
  methods,
  summary,
}: {
  paymentId: string;
  amountLabel: string;
  expiresAt: string;
  initialSeconds: number;
  methods: ManualPaymentMethodView[];
  summary?: ManualPaymentCheckoutSummary;
}) {
  const [state, action, pending] = useActionState(
    submitProofWithUploadFallback,
    initialState
  );
  const [selectedId, setSelectedId] = useState(methods[0]?.id ?? "");
  const [receiptReady, setReceiptReady] = useState(false);
  const selected = methods.find((method) => method.id === selectedId);

  if (state.success) {
    return (
      <div
        className={`rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center ${
          summary ? "mx-auto max-w-2xl sm:p-8" : "p-5"
        }`}
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-xl text-white">
          ✓
        </div>
        <h2 className="mt-3 text-lg font-black text-navy">Proof submitted</h2>
        <p className="mt-1 text-sm font-bold text-amber-800">
          Pending booking · venue review
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
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

  if (!summary) {
    return (
      <CompactManualPaymentForm
        paymentId={paymentId}
        amountLabel={amountLabel}
        expiresAt={expiresAt}
        initialSeconds={initialSeconds}
        methods={methods}
        selectedId={selectedId}
        selected={selected}
        state={state}
        pending={pending}
        onSelect={setSelectedId}
        action={action}
      />
    );
  }

  const stripDetail =
    summary.lines.length === 1
      ? `${summary.lines[0].label} · ${summary.lines[0].detail}`
      : `${summary.lines.length} reserved court times`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
          Manual payment
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-navy sm:text-4xl">
          Complete your booking
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
          Transfer the exact amount using one of the venue&apos;s payment
          methods, then upload your receipt before the hold expires.
        </p>
      </header>

      <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-primary">
            {summary.venueName}
          </p>
          <p className="mt-1 text-sm font-semibold text-navy">{stripDetail}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">
            Exact total
          </p>
          <p className="mt-0.5 font-mono text-2xl font-black text-navy">
            {summary.totalLabel}
          </p>
        </div>
      </div>

      <form action={action} className="mt-6">
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="methodId" value={selectedId} />

        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
              Payment deadline
            </p>
            <p className="mt-1 text-sm leading-5 text-amber-800">
              Upload your receipt before the timer reaches zero or the reserved
              slots will be released.
            </p>
          </div>
          <HoldCountdown
            expiresAt={expiresAt}
            initialSeconds={initialSeconds}
            label="Time left"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
              <SectionHeading step="1" title="Upload payment receipt" />
              <div className="space-y-5 p-5 sm:p-6">
                <ReceiptUpload
                  error={state.errors?.receiptImage}
                  variant="checkout"
                  onValueChange={(value) => setReceiptReady(Boolean(value))}
                />
                <label className="block text-sm font-semibold text-slate-700">
                  Transaction or reference number{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    name="paymentReference"
                    maxLength={120}
                    placeholder="e.g. 0012 345 678901"
                    aria-invalid={Boolean(state.errors?.paymentReference)}
                    className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy shadow-sm focus:border-primary focus:outline-none"
                  />
                  {state.errors?.paymentReference && (
                    <span className="mt-1.5 block text-xs text-red-500">
                      {state.errors.paymentReference}
                    </span>
                  )}
                </label>
                {state.message && (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
                  >
                    {state.message}
                  </p>
                )}
                <button
                  disabled={pending || !receiptReady}
                  className="w-full rounded-xl bg-primary px-5 py-4 text-sm font-black text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pending ? "Submitting proof…" : "Submit payment proof"}
                </button>
                {!receiptReady && (
                  <p className="text-center text-xs text-slate-400">
                    Upload your payment receipt to continue.
                  </p>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
              <SectionHeading step="2" title="Payment methods" />
              <div className="p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {methods.map((method) => (
                    <PaymentMethodButton
                      key={method.id}
                      method={method}
                      selected={selectedId === method.id}
                      onSelect={() => setSelectedId(method.id)}
                    />
                  ))}
                </div>
                {state.errors?.methodId && (
                  <p className="mt-2 text-xs text-red-500">
                    {state.errors.methodId}
                  </p>
                )}

                {selected && (
                  <div className="mt-6 rounded-2xl border border-navy/10 bg-navy-soft/55 p-5 sm:p-6">
                    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                      {selected.qrImage ? (
                        <div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={selected.qrImage}
                              alt={`${selected.label} payment QR`}
                              className="aspect-square w-full object-cover"
                            />
                          </div>
                          <QrImageDownloadButton
                            src={selected.qrImage}
                            label={selected.label}
                          />
                          <QrPaymentTip method={selected} />
                        </div>
                      ) : (
                        <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-navy/15 bg-white/60 p-5 text-center text-xs font-semibold text-slate-400">
                          Use the account details to complete your transfer.
                        </div>
                      )}

                      <dl className="min-w-0 space-y-5 text-sm">
                        <div>
                          <dt className="text-xs font-black uppercase tracking-[0.14em] text-navy/50">
                            Transfer exactly
                          </dt>
                          <dd className="mt-1 font-mono text-3xl font-black tracking-tight text-navy">
                            {amountLabel}
                          </dd>
                        </div>
                        {selected.accountName && (
                          <Detail
                            label="Account name"
                            value={selected.accountName}
                            copy
                          />
                        )}
                        {selected.accountIdentifier && (
                          <Detail
                            label="Account details"
                            value={selected.accountIdentifier}
                            copy
                          />
                        )}
                        {selected.instructions && (
                          <div className="border-t border-navy/10 pt-4">
                            <dt className="text-xs font-bold text-slate-500">
                              Venue instructions
                            </dt>
                            <dd className="mt-1 whitespace-pre-line leading-6 text-navy">
                              {selected.instructions}
                            </dd>
                          </div>
                        )}
                        <p className="border-t border-navy/10 pt-4 text-xs leading-5 text-slate-500">
                          The total includes Bunal.club&apos;s{" "}
                          {MANUAL_SERVICE_FEE_PERCENT}%
                          non-refundable service fee. No PayMongo processing
                          fee is added.
                        </p>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <ImportantNotes />
          </div>

          <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-8">
            <BookingSummary summary={summary} />
            <VenueHelp summary={summary} />
          </aside>
        </div>
      </form>
    </div>
  );
}

function CompactManualPaymentForm({
  paymentId,
  amountLabel,
  expiresAt,
  initialSeconds,
  methods,
  selectedId,
  selected,
  state,
  pending,
  onSelect,
  action,
}: {
  paymentId: string;
  amountLabel: string;
  expiresAt: string;
  initialSeconds: number;
  methods: ManualPaymentMethodView[];
  selectedId: string;
  selected: ManualPaymentMethodView | undefined;
  state: ManualPaymentFormState;
  pending: boolean;
  onSelect: (id: string) => void;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="methodId" value={selectedId} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
            Upload deadline
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            Unpaid slots are released after 15 minutes.
          </p>
        </div>
        <HoldCountdown
          expiresAt={expiresAt}
          initialSeconds={initialSeconds}
        />
      </div>

      <section>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          1. Select payment network
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {methods.map((method) => (
            <PaymentMethodButton
              key={method.id}
              method={method}
              selected={selectedId === method.id}
              onSelect={() => onSelect(method.id)}
            />
          ))}
        </div>
        {state.errors?.methodId && (
          <p className="mt-2 text-xs text-red-500">{state.errors.methodId}</p>
        )}
      </section>

      {selected && (
        <section className="rounded-2xl border border-navy/10 bg-navy-soft p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-navy/50">
            2. Transfer exactly {amountLabel}
          </p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            {selected.qrImage && (
              <div className="w-full sm:w-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.qrImage}
                  alt={`${selected.label} payment QR`}
                  className="mx-auto size-48 rounded-2xl border border-slate-200 bg-white object-cover p-2 sm:mx-0"
                />
                <QrImageDownloadButton
                  src={selected.qrImage}
                  label={selected.label}
                  compact
                />
                <QrPaymentTip method={selected} compact />
              </div>
            )}
            <dl className="min-w-0 flex-1 space-y-3 text-sm">
              {selected.accountName && (
                <Detail label="Account name" value={selected.accountName} />
              )}
              {selected.accountIdentifier && (
                <Detail
                  label="Account details"
                  value={selected.accountIdentifier}
                  copy
                />
              )}
              {selected.instructions && (
                <div>
                  <dt className="text-xs font-bold text-slate-500">
                    Instructions
                  </dt>
                  <dd className="mt-1 whitespace-pre-line leading-6 text-navy">
                    {selected.instructions}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            The total includes Bunal.club&apos;s {MANUAL_SERVICE_FEE_PERCENT}%
            non-refundable service fee. No PayMongo processing fee is added.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          3. Submit proof of payment
        </p>
        <ReceiptUpload error={state.errors?.receiptImage} />
        <label className="block text-sm font-medium text-slate-700">
          Transaction or reference number{" "}
          <span className="font-normal text-slate-400">(optional)</span>
          <input
            name="paymentReference"
            maxLength={120}
            placeholder="e.g. 0012 345 678901"
            aria-invalid={Boolean(state.errors?.paymentReference)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy"
          />
          {state.errors?.paymentReference && (
            <span className="mt-1.5 block text-xs text-red-500">
              {state.errors.paymentReference}
            </span>
          )}
        </label>
      </section>

      {state.message && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-black text-white shadow-sm hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? "Submitting proof…" : "Submit payment proof"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-400">
        After submission, the booking remains Pending until the venue reviews
        the receipt. Your reserved capacity stays protected during review.
      </p>
    </form>
  );
}

function SectionHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-navy">
        <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[10px] text-white">
          {step}
        </span>
        {title}
      </h2>
    </div>
  );
}

function PaymentMethodButton({
  method,
  selected,
  onSelect,
}: {
  method: ManualPaymentMethodView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary-soft shadow-sm"
          : "border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-bold text-navy">{method.label}</span>
        <span
          aria-hidden="true"
          className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${
            selected
              ? "border-primary bg-primary text-white"
              : "border-slate-300 text-transparent"
          }`}
        >
          ✓
        </span>
      </span>
      <span
        className={`mt-1 block text-[10px] font-black uppercase tracking-[0.12em] ${
          selected ? "text-primary" : "text-slate-400"
        }`}
      >
        {method.network.replace("_", " ")}
      </span>
    </button>
  );
}

function QrPaymentTip({
  method,
  compact = false,
}: {
  method: ManualPaymentMethodView;
  compact?: boolean;
}) {
  const appName =
    method.network === "GCASH"
      ? "GCash"
      : method.network === "MAYA"
        ? "Maya"
        : method.label;

  return (
    <div
      className={`rounded-xl border border-primary/20 bg-primary-soft text-navy ${
        compact ? "mt-3 px-3 py-2.5" : "mt-3 px-3.5 py-3"
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-black text-primary">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h1M17 14v3h-3" />
        </svg>
        Scan with {appName}
      </p>
      <p className="mt-1.5 text-[11px] leading-4 text-navy/70">
        Scan this QR code in the {appName} app. On this device, download the
        image and import it from your gallery.
      </p>
    </div>
  );
}

function QrImageDownloadButton({
  src,
  label,
  compact = false,
}: {
  src: string;
  label: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<
    "preparing" | "idle" | "saving" | "error"
  >("preparing");
  const [prepared, setPrepared] = useState<{
    blob: Blob;
    file: File;
    filename: string;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function prepareImage() {
      setPrepared(null);
      setStatus("preparing");

      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error("QR image could not be loaded");

        const sourceBlob = await response.blob();
        if (!sourceBlob.type.startsWith("image/")) {
          throw new Error("QR download was not an image");
        }

        let blob = sourceBlob;
        let type = sourceBlob.type;
        let extension = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "png";
        try {
          blob = await focusQrImageBlob(sourceBlob);
          type = "image/png";
          extension = "png";
        } catch {
          // Older iOS PWA builds can reject createImageBitmap. The original
          // partner image is still more useful than a failed save action.
        }

        const safeLabel =
          label
            .normalize("NFKD")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "manual-payment";
        const filename = `${safeLabel}-payment-qr.${extension}`;
        if (!active) return;
        setPrepared({
          blob,
          file: new File([blob], filename, { type }),
          filename,
        });
        setStatus("idle");
      } catch {
        if (!active) return;
        setStatus("error");
      }
    }

    void prepareImage();
    return () => {
      active = false;
    };
  }, [label, retryKey, src]);

  async function downloadImage() {
    if (status === "error") {
      setRetryKey((current) => current + 1);
      return;
    }
    if (!prepared) return;
    setStatus("saving");

    try {
      if (
        navigator.maxTouchPoints > 0 &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [prepared.file] })
      ) {
        await navigator.share({
          files: [prepared.file],
          title: `${label} payment QR`,
        });
      } else {
        const objectUrl = URL.createObjectURL(prepared.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = prepared.filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      }

      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <button
        type="button"
        onClick={downloadImage}
        disabled={status === "preparing" || status === "saving"}
        className="flex min-h-10 w-full items-center justify-center rounded-xl border border-navy/10 bg-white px-3 text-xs font-bold text-primary transition-colors hover:bg-primary-soft disabled:cursor-wait disabled:opacity-60"
      >
        {status === "preparing"
          ? "Preparing image…"
          : status === "saving"
            ? "Opening save options…"
            : status === "error"
              ? "Retry download"
              : "Save QR image"}
      </button>
      {status === "error" && (
        <p className="mt-2 text-center text-[11px] leading-4 text-red-600">
          The image could not be prepared. Tap Retry download.
        </p>
      )}
    </div>
  );
}

function BookingSummary({
  summary,
}: {
  summary: ManualPaymentCheckoutSummary;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <h2 className="text-xs font-black uppercase tracking-[0.14em] text-navy">
          Booking summary
        </h2>
      </div>
      <div className="p-5">
        <p className="font-black text-navy">{summary.venueName}</p>
        <div className="mt-4 space-y-3 border-y border-slate-100 py-4">
          {summary.lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{line.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {line.detail}
                </p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-slate-500">
                {line.quantity}
              </p>
            </div>
          ))}
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Court time</dt>
            <dd className="font-semibold text-navy">
              {summary.venueAmountLabel}
            </dd>
          </div>
          {summary.serviceFeeLabel && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Service fee</dt>
              <dd className="font-semibold text-navy">
                {summary.serviceFeeLabel}
              </dd>
            </div>
          )}
          <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
            <dt className="font-black text-navy">Total amount</dt>
            <dd className="font-mono text-xl font-black text-navy">
              {summary.totalLabel}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function VenueHelp({
  summary,
}: {
  summary: ManualPaymentCheckoutSummary;
}) {
  const primaryHref = summary.venuePhone
    ? `tel:${summary.venuePhone}`
    : summary.venueEmail
      ? `mailto:${summary.venueEmail}`
      : summary.venueHref;
  const primaryLabel = summary.venuePhone
    ? "Call venue"
    : summary.venueEmail
      ? "Email venue"
      : "View venue";

  return (
    <section className="rounded-2xl bg-navy p-5 text-white shadow-sm shadow-navy/15">
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-lg">
        ?
      </div>
      <h2 className="mt-4 text-sm font-black uppercase tracking-[0.12em]">
        Need help?
      </h2>
      <p className="mt-2 text-xs leading-5 text-white/65">
        Contact the venue directly for transfer or payment-verification
        questions.
      </p>
      <a
        href={primaryHref}
        className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
      >
        {primaryLabel}
      </a>
    </section>
  );
}

function ImportantNotes() {
  return (
    <section className="flex gap-4 rounded-2xl border border-ocean/20 bg-ocean-soft p-5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white font-black text-ocean">
        i
      </div>
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.12em] text-navy">
          Important notes
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-5 text-navy/75 marker:text-ocean">
          <li>Transfer the exact amount shown for this booking.</li>
          <li>
            Upload the receipt before the 15-minute hold expires or the slots
            will be released.
          </li>
          <li>
            After submission, the booking remains Pending until the venue
            approves or declines the proof.
          </li>
          <li>
            The {MANUAL_SERVICE_FEE_PERCENT}% Bunal.club service fee is
            non-refundable.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Detail({
  label,
  value,
  copy = false,
}: {
  label: string;
  value: string;
  copy?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 break-all font-bold text-navy">
        {value}
        {copy && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(value)}
            className="shrink-0 rounded-lg border border-navy/10 bg-white px-2 py-1 text-[10px] font-bold text-primary"
          >
            Copy
          </button>
        )}
      </dd>
    </div>
  );
}
