import Link from "next/link";

import { PageShell } from "@/components/PageShell";

export default function GuestBookingAccessInvalidPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          Private booking link
        </p>
        <h1 className="mt-3 text-2xl font-black text-navy">
          This link is unavailable
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          The link may have expired or been copied incorrectly. Open the most
          recent booking email from Bunal.club, or contact the venue for help.
        </p>
        <Link
          href="/hubs"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white"
        >
          Find a court
        </Link>
      </div>
    </PageShell>
  );
}
