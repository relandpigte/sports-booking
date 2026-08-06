"use client";

import { useState } from "react";
import Link from "next/link";

export function ProfileCompletionCard({
  missing,
}: {
  missing: string[];
}) {
  const [dismissed, setDismissed] = useState(false);
  if (missing.length === 0 || dismissed) return null;

  return (
    <section className="mt-8 rounded-2xl border border-primary/20 bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Optional profile setup
          </p>
          <h2 className="mt-1 font-bold text-navy">Help players recognize you</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Add {missing.join(", ")} whenever you like. Your account and
            booking access are already ready.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Dismiss
          </button>
          <Link
            href="/dashboard/account"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover"
          >
            Complete profile
          </Link>
        </div>
      </div>
    </section>
  );
}
