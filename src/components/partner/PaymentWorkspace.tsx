"use client";

import { useState, type ReactNode } from "react";

type PaymentWorkspaceTab = "checkout" | "payouts" | "settlement";

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

const TAB_LABEL: Record<PaymentWorkspaceTab, string> = {
  checkout: "Player checkout",
  payouts: "Payouts",
  // Fees accrued while players paid the venue's own PayMongo account. New
  // payments are collected by Bunal.club and accrue nothing here.
  settlement: "Earlier service fees",
};

export function PaymentWorkspace({
  initialTab = "checkout",
  summary,
  checkout,
  payouts,
  settlement,
}: {
  initialTab?: PaymentWorkspaceTab;
  summary: PaymentSummaryItem[];
  checkout: ReactNode;
  payouts: ReactNode;
  // Omitted for a partner with no balance or history from before platform
  // collection, so a new venue never sees a settlement screen at all.
  settlement?: ReactNode;
}) {
  const tabs: PaymentWorkspaceTab[] = settlement
    ? ["checkout", "payouts", "settlement"]
    : ["checkout", "payouts"];
  const [activeTab, setActiveTab] = useState<PaymentWorkspaceTab>(
    tabs.includes(initialTab) ? initialTab : "checkout"
  );
  const panels: Record<PaymentWorkspaceTab, ReactNode> = {
    checkout,
    payouts,
    settlement,
  };

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
        {tabs.map((tab) => (
          <WorkspaceTab
            key={tab}
            active={activeTab === tab}
            controls={`payment-${tab}-panel`}
            id={`payment-${tab}-tab`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABEL[tab]}
          </WorkspaceTab>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab}
          id={`payment-${tab}-panel`}
          role="tabpanel"
          aria-labelledby={`payment-${tab}-tab`}
          hidden={activeTab !== tab}
          className="mt-5"
        >
          {panels[tab]}
        </div>
      ))}
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
