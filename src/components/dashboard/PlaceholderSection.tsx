import type { ReactNode } from "react";

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
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center">
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
