import Link from "next/link";

import { PageShell } from "@/components/PageShell";

export default function InvalidGuestEventAccessPage() {
  return (
    <PageShell maxWidth="max-w-xl">
      <div className="py-16 sm:py-24">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            Private event access
          </p>
          <h1 className="mt-3 text-3xl font-black text-navy">
            This link is no longer valid
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            The link may have expired or the registration may no longer be
            available. Check your latest Bunal.club email or contact the event
            organizer.
          </p>
          <Link
            href="/events"
            className="mt-7 inline-flex rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-white hover:bg-primary-hover"
          >
            Browse events
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
