import type { Metadata } from "next";
import Link from "next/link";

import { GuestQuickQueueForm } from "@/components/open-play/GuestQuickQueueForm";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Create a BunalQ — Bunal.club",
  description:
    "Create and share a live pickleball court rotation without an account.",
  robots: { index: false, follow: false },
};

export default function NewGuestBunalQPage() {
  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="py-8 sm:py-12">
        <Link href="/bunalq" className="text-sm font-bold text-primary">
          ← Live BunalQ
        </Link>
        <header className="my-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            No account needed
          </p>
          <h1 className="mt-1 text-3xl font-black text-navy">
            Create a public BunalQ
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Set up a court rotation, add players, and share the live board by
            link or QR code. Your queue stays unlisted from the public directory.
          </p>
        </header>
        <GuestQuickQueueForm />
      </div>
    </PageShell>
  );
}
