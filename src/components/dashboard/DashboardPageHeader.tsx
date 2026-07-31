import type { ReactNode } from "react";

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1
          className={`${eyebrow ? "mt-2" : ""} text-3xl font-black tracking-[-0.035em] text-navy`}
        >
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {(badge || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {badge}
          {actions}
        </div>
      )}
    </header>
  );
}
