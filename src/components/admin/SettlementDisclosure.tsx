import type { ReactNode } from "react";

export function SettlementDisclosure({
  title,
  count,
  description,
  label,
  children,
}: {
  title: string;
  count: number;
  description: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-2.5 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
        <div className="flex min-w-0 items-center gap-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          >
            <path
              d="m5 7.5 5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-navy">{title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {count} {count === 1 ? "record" : "records"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {description}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-primary">
          <span className="group-open:hidden">Show {label}</span>
          <span className="hidden group-open:inline">Hide {label}</span>
        </span>
      </summary>
      <div className="border-t border-slate-200">{children}</div>
    </details>
  );
}
