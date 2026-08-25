"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type SettlementMethod = "paymongo" | "manual";

export function ServiceFeeSettlementTabs({
  paymongoAvailable,
  paymongo,
  manual,
}: {
  paymongoAvailable: boolean;
  paymongo: ReactNode;
  manual: ReactNode;
}) {
  const id = useId();
  const [activeMethod, setActiveMethod] = useState<SettlementMethod>(
    paymongoAvailable ? "paymongo" : "manual"
  );

  if (!paymongoAvailable) {
    return (
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        {manual}
      </section>
    );
  }

  const paymongoTabId = `${id}-paymongo-tab`;
  const paymongoPanelId = `${id}-paymongo-panel`;
  const manualTabId = `${id}-manual-tab`;
  const manualPanelId = `${id}-manual-panel`;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextMethod =
      event.key === "Home"
        ? "paymongo"
        : event.key === "End"
          ? "manual"
          : activeMethod === "paymongo"
            ? "manual"
            : "paymongo";
    setActiveMethod(nextMethod);
    document
      .getElementById(nextMethod === "paymongo" ? paymongoTabId : manualTabId)
      ?.focus();
  }

  return (
    <div className="mt-5">
      <div
        role="tablist"
        aria-label="Settlement payment method"
        onKeyDown={handleKeyDown}
        className="rounded-2xl border border-[#dfe7e2] bg-slate-50/70 p-1.5"
      >
        <div className="grid grid-cols-2 gap-1.5">
          <button
            id={paymongoTabId}
            type="button"
            role="tab"
            aria-selected={activeMethod === "paymongo"}
            aria-controls={paymongoPanelId}
            tabIndex={activeMethod === "paymongo" ? 0 : -1}
            onClick={() => setActiveMethod("paymongo")}
            className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              activeMethod === "paymongo"
                ? "border-primary/15 bg-white text-primary shadow-sm"
                : "border-transparent text-slate-500 hover:bg-white/70 hover:text-navy"
            }`}
          >
            <QrCodeIcon />
            <span className="truncate">PayMongo</span>
            <span className="hidden rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-primary sm:inline">
              Recommended
            </span>
          </button>
          <button
            id={manualTabId}
            type="button"
            role="tab"
            aria-selected={activeMethod === "manual"}
            aria-controls={manualPanelId}
            tabIndex={activeMethod === "manual" ? 0 : -1}
            onClick={() => setActiveMethod("manual")}
            className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              activeMethod === "manual"
                ? "border-primary/15 bg-white text-primary shadow-sm"
                : "border-transparent text-slate-500 hover:bg-white/70 hover:text-navy"
            }`}
          >
            <LandmarkIcon />
            <span className="truncate">Manual fallback</span>
          </button>
        </div>
      </div>

      <section
        id={paymongoPanelId}
        role="tabpanel"
        aria-labelledby={paymongoTabId}
        hidden={activeMethod !== "paymongo"}
        className="mt-4 rounded-2xl border border-primary/20 bg-primary-soft/60 p-4 sm:p-5"
      >
        {paymongo}
      </section>
      <section
        id={manualPanelId}
        role="tabpanel"
        aria-labelledby={manualTabId}
        hidden={activeMethod !== "manual"}
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        {manual}
      </section>
    </div>
  );
}

function QrCodeIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M16 16h.01M20 16h.01M16 20h.01M20 20h.01" />
    </svg>
  );
}

function LandmarkIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m3 10 9-6 9 6" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18" />
    </svg>
  );
}
