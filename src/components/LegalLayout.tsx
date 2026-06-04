import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </Link>

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-1 text-sm text-gray-500">Last updated {updated}</p>
          </div>
        </div>

        <article className="prose-legal mt-8 flex flex-col gap-6 text-sm leading-relaxed text-gray-600">
          {children}
        </article>

        <div className="mt-10 flex items-center justify-center gap-4 border-t border-gray-100 pt-6 text-sm">
          <Link href="/terms" className="font-medium text-primary hover:underline">
            Terms &amp; Conditions
          </Link>
          <span className="text-gray-300">•</span>
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </main>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
      {children}
    </section>
  );
}
