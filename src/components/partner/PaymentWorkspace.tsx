"use client";

import { useState, type ReactNode } from "react";

type PaymentWorkspaceTab = "checkout" | "settlement";

type PaymentSummaryItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneClasses = {
  default: "text-navy",
  success: "text-primary",
  warning: "text-amber-700",
  danger: "text-red-600",
};

export function PaymentWorkspace({
  initialTab = "checkout",
  settlementFirst = false,
  summary,
  checkout,
  settlement,
}: {
  initialTab?: PaymentWorkspaceTab;
  settlementFirst?: boolean;
  summary: PaymentSummaryItem[];
  checkout: ReactNode;
  settlement: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<PaymentWorkspaceTab>(initialTab);
  const orderedTabs: PaymentWorkspaceTab[] = settlementFirst
    ? ["settlement", "checkout"]
    : ["checkout", "settlement"];

  return (
    <div className="mt-6">
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 xl:grid-cols-4">
        {summary.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 px-3.5 py-3.5 sm:px-5 ${
              index > 1 ? "border-t border-slate-100 xl:border-t-0" : ""
            } ${index % 2 === 1 ? "border-l border-slate-100" : ""} ${
              index > 0 ? "xl:border-l" : ""
            }`}
          >
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {item.label}
            </dt>
            <dd
              className={`mt-1 truncate text-sm font-bold ${
                toneClasses[item.tone ?? "default"]
              }`}
              title={item.value}
            >
              {item.value}
            </dd>
            {item.detail && (
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {item.detail}
              </p>
            )}
          </div>
        ))}
      </dl>

      <div
        className="mt-6 flex gap-6 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Payment workspace"
      >
        {orderedTabs.map((tab) => (
          <WorkspaceTab
            key={tab}
            active={activeTab === tab}
            controls={
              tab === "checkout"
                ? "player-checkout-panel"
                : "service-fee-settlement-panel"
            }
            id={
              tab === "checkout"
                ? "player-checkout-tab"
                : "service-fee-settlement-tab"
            }
            onClick={() => setActiveTab(tab)}
          >
            {tab === "checkout"
              ? "Player checkout"
              : "Service-fee settlement"}
          </WorkspaceTab>
        ))}
      </div>

      <div
        id="player-checkout-panel"
        role="tabpanel"
        aria-labelledby="player-checkout-tab"
        hidden={activeTab !== "checkout"}
        className="mt-5"
      >
        {checkout}
      </div>
      <div
        id="service-fee-settlement-panel"
        role="tabpanel"
        aria-labelledby="service-fee-settlement-tab"
        hidden={activeTab !== "settlement"}
        className="mt-5"
      >
        {settlement}
      </div>
    </div>
  );
}

function WorkspaceTab({
  active,
  controls,
  id,
  onClick,
  children,
}: {
  active: boolean;
  controls: string;
  id: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 border-b-2 px-0.5 pb-3 text-sm font-bold transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}
