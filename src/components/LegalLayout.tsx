import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import Link from "next/link";

import { ClosingCta } from "@/components/ClosingCta";
import { SiteFooter } from "@/components/SiteFooter";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

interface LegalSectionProps {
  heading: string;
  children: ReactNode;
}

type LegalSectionDetails = {
  id: string;
  label: string;
  number: string;
};

function legalSectionDetails(heading: string): LegalSectionDetails {
  const match = heading.match(/^(\d+)\.\s*(.+)$/);
  const number = match?.[1] ?? "";
  const label = match?.[2] ?? heading;
  const id = label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return { id, label, number };
}

function getSectionLinks(children: ReactNode) {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<LegalSectionProps>(child) ||
      child.type !== LegalSection
    ) {
      return [];
    }

    return [legalSectionDetails(child.props.heading)];
  });
}

function SectionLinks({
  sections,
  compact = false,
}: {
  sections: LegalSectionDetails[];
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="Legal document sections"
      className={
        compact
          ? "mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
          : "flex flex-col gap-1"
      }
    >
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="group flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-primary-soft hover:text-primary"
        >
          <span className="w-5 shrink-0 text-xs font-bold text-gray-400 group-hover:text-primary">
            {section.number.padStart(2, "0")}
          </span>
          <span>{section.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  const content = Children.toArray(children);
  const introduction = content[0] ?? null;
  const legalSections = content.slice(1);
  const sectionLinks = getSectionLinks(legalSections);
  const privacyPage = title === "Privacy Policy";
  const alternatePage = privacyPage
    ? { href: "/terms", label: "Terms & Conditions" }
    : { href: "/privacy", label: "Privacy Policy" };
  const contactEmail = privacyPage
    ? "privacy@bunal.club"
    : "support@bunal.club";

  return (
    <div className="bg-[#f7faf8]">
      <section className="bg-navy text-white">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-white"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to home
          </Link>

          <div className="mt-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
              Trust center
            </p>
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-sm font-medium text-white/60">
            Last updated {updated}
          </p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-8 px-5 py-10 sm:px-6 sm:py-14 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:py-16">
        <details className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-navy marker:content-none">
            Jump to a section
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <SectionLinks sections={sectionLinks} compact />
        </details>

        <article className="flex flex-col gap-5 lg:col-span-8">
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-6 text-[15px] leading-7 text-gray-700 shadow-sm sm:p-8 sm:text-base">
            {introduction}
          </div>
          {legalSections}

          <nav
            aria-label="Legal pages"
            className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-[#dfe7e2] pt-7 text-sm font-semibold"
          >
            <Link href="/terms" className="text-primary hover:underline">
              Terms &amp; Conditions
            </Link>
            <span className="text-gray-300" aria-hidden="true">
              •
            </span>
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </nav>
        </article>

        <aside className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                On this page
              </p>
              <SectionLinks sections={sectionLinks} />
            </div>

            <div className="rounded-2xl border border-primary/10 bg-primary-soft p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-primary">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <p className="text-sm font-bold text-navy">
                  {alternatePage.label}
                </p>
              </div>
              <Link
                href={alternatePage.href}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline"
              >
                Read {alternatePage.label}
              </Link>
            </div>

            <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-navy">Questions?</p>
              <p className="mt-1.5 text-sm leading-6 text-gray-500">
                Contact us about this document.
              </p>
              <a
                href={`mailto:${contactEmail}`}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-navy px-3 text-sm font-bold text-navy transition-colors hover:bg-navy hover:text-white"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <polyline points="3 7 12 13 21 7" />
                </svg>
                {contactEmail}
              </a>
            </div>
          </div>
        </aside>
      </div>

      <div className="bg-white pt-2">
        <ClosingCta />
      </div>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  const { id, label, number } = legalSectionDetails(heading);

  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-2xl border border-[#dfe7e2] bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-soft text-sm font-bold text-navy">
          {number.padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-[-0.02em] text-navy">
            {label}
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-[15px] leading-7 text-gray-600 sm:text-base [&_a]:font-semibold [&_a]:text-primary [&_a]:hover:underline [&_code]:rounded-md [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_li]:pl-1 [&_ul]:space-y-2">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
