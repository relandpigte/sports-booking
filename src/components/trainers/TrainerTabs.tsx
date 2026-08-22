"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["/dashboard/trainer", "Profile"],
  ["/dashboard/trainer/schedule", "Schedule"],
  ["/dashboard/trainer/sessions", "Sessions"],
  ["/dashboard/trainer/payments", "Payments"],
] as const;

export function TrainerTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Trainer tools"
      className="flex gap-6 overflow-x-auto border-b border-slate-200"
    >
      {tabs.map(([href, label]) => {
        const active = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-0.5 pb-3 pt-2 text-sm font-bold transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
