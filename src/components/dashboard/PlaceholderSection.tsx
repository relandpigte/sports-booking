import type { ReactNode } from "react";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export function PlaceholderSection({
  title,
  subtitle,
  icon,
  message,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  message: string;
}) {
  return (
    <div>
      <DashboardPageHeader title={title} description={subtitle} />

      <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm shadow-navy/5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          {icon}
        </div>
        <p className="max-w-sm text-sm text-gray-500">{message}</p>
        <span className="mt-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
          Coming soon
        </span>
      </div>
    </div>
  );
}
