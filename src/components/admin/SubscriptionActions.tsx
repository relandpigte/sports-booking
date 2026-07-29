"use client";

import { useActionState, useState } from "react";

import {
  compPeriodAction,
  createPaymentLinkAction,
  recordOfflinePaymentAction,
  type AdminBillingFormState,
} from "@/lib/admin-billing-actions";

const initial: AdminBillingFormState = {};

function CopyLink({ url, qr }: { url: string; qr?: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  return (
    <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-600">
        {url}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {qr && (
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          {showQr ? "Hide QR" : "QR"}
        </button>
      )}
    </div>

    {/* Server-rendered SVG: the markup is ours, built from the encoder's
        matrix, so there is no untrusted HTML here. */}
    {qr && showQr && (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white p-3">
        <div
          className="w-40"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <p className="text-xs text-gray-400">
          Scan to pay this invoice
        </p>
      </div>
    )}
    </div>
  );
}

// The three ways to collect from one partner: send them a link, record money
// that arrived some other way, or give the month away.
//
// Each is its own form so a failure in one doesn't clear the others, and all
// three write through the same ledger the partner sees on their own page.
export function SubscriptionActions({
  userId,
  amountLabel,
  openCheckoutUrl,
}: {
  userId: string;
  amountLabel: string;
  openCheckoutUrl: string | null;
}) {
  const [linkState, linkAction, linking] = useActionState(
    createPaymentLinkAction,
    initial
  );
  const [offlineState, offlineAction, recording] = useActionState(
    recordOfflinePaymentAction,
    initial
  );
  const [compState, compAction, comping] = useActionState(
    compPeriodAction,
    initial
  );

  const [confirming, setConfirming] = useState<"offline" | "comp" | null>(null);

  const state = linkState.checkoutUrl
    ? linkState
    : offlineState.success || offlineState.message
      ? offlineState
      : compState.success || compState.message
        ? compState
        : linkState;

  const url = linkState.checkoutUrl ?? openCheckoutUrl;
  // Only for a link created in this session — an older open checkout has a URL
  // but no code, and generating one client-side would need a bundle.
  const qr = linkState.qrSvg;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={linkAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={linking}
            className="rounded-md bg-primary-soft px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-accent-soft disabled:opacity-50"
          >
            {linking ? "Creating…" : "Payment link"}
          </button>
        </form>

        <button
          type="button"
          onClick={() =>
            setConfirming((c) => (c === "offline" ? null : "offline"))
          }
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Mark paid
        </button>

        <button
          type="button"
          onClick={() => setConfirming((c) => (c === "comp" ? null : "comp"))}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
        >
          Comp
        </button>
      </div>

      {/* Both of these move a subscription without any money passing through
          the app, so neither fires on a single click. */}
      {confirming === "offline" && (
        <form action={offlineAction} className="flex flex-col gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <input
            name="note"
            placeholder="Reference — e.g. BPI transfer 12 Aug"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={recording}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {recording ? "Recording…" : `Record ${amountLabel} received`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="text-xs text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {confirming === "comp" && (
        <form action={compAction} className="flex flex-col gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <input
            name="note"
            placeholder="Why — e.g. launch partner"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={comping}
              className="rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-hover disabled:opacity-50"
            >
              {comping ? "Comping…" : "Comp one month (₱0)"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="text-xs text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {state.success && (
        <p role="status" className="text-xs font-medium text-green-700">
          {state.success}
        </p>
      )}
      {state.message && (
        <p role="alert" className="text-xs text-red-600">
          {state.message}
        </p>
      )}

      {url && <CopyLink url={url} qr={qr} />}
    </div>
  );
}
