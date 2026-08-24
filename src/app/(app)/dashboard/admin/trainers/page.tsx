import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, TrainerStatus } from "@prisma/client";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/admin";
import { formatPHP } from "@/lib/currency";
import { prisma } from "@/lib/db";
import { decideTrainerApplicationAction } from "@/lib/trainer-actions";
import { trainerPaymentReady } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Reviews — Bunal.club" };

const trainerReviewInclude = {
  user: {
    select: {
      name: true,
      playerName: true,
      email: true,
      phone: true,
      image: true,
      username: true,
      trainerGateway: { select: { disconnectedAt: true } },
      trainerManualMethods: {
        where: { active: true },
        select: { id: true },
      },
    },
  },
  weeklyRules: true,
} satisfies Prisma.TrainerProfileInclude;

type TrainerReviewProfile = Prisma.TrainerProfileGetPayload<{
  include: typeof trainerReviewInclude;
}>;

type TrainerFilter = "ALL" | TrainerStatus;

const FILTERS: Array<{ label: string; value: TrainerFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Deactivated", value: "DEACTIVATED" },
];

const STATUS_PRIORITY: Record<TrainerStatus, number> = {
  PENDING: 0,
  DRAFT: 1,
  ACTIVE: 2,
  DEACTIVATED: 3,
};

export default async function AdminTrainersPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string | string[];
    status?: string | string[];
  }>;
}) {
  await requireAdmin();
  const rawSearchParams = await searchParams;
  const query = firstValue(rawSearchParams.query).trim();
  const activeFilter = parseTrainerFilter(firstValue(rawSearchParams.status));

  const profiles = await prisma.trainerProfile.findMany({
    orderBy: { submittedAt: "desc" },
    include: trainerReviewInclude,
  });
  profiles.sort(
    (left, right) => STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status]
  );

  const counts = profiles.reduce<Record<TrainerStatus, number>>(
    (result, profile) => {
      result[profile.status] += 1;
      return result;
    },
    { DRAFT: 0, PENDING: 0, ACTIVE: 0, DEACTIVATED: 0 }
  );
  const normalizedQuery = query.toLocaleLowerCase("en-PH");
  const visibleProfiles = profiles.filter((profile) => {
    if (activeFilter !== "ALL" && profile.status !== activeFilter) {
      return false;
    }
    if (!normalizedQuery) return true;

    const searchable = [
      profile.user.playerName,
      profile.user.name,
      profile.user.username,
      profile.user.email,
      profile.user.phone,
      profile.area,
      ...profile.sports,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-PH");
    return searchable.includes(normalizedQuery);
  });

  return (
    <div className="space-y-5">
      <DashboardPageHeader
        eyebrow="Admin review"
        title="Trainer applications"
        description="Review trainer profiles, required public information, schedules, and payment readiness."
        badge={
          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe7e2] bg-white px-3 text-sm font-semibold text-navy shadow-sm">
            <InboxIcon />
            {counts.PENDING} awaiting review
          </div>
        }
      />

      <section
        aria-label="Trainer application totals"
        className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm lg:grid-cols-4"
      >
        <SummaryStat label="All applications" value={profiles.length} />
        <SummaryStat
          label="Pending review"
          value={counts.PENDING}
          valueClassName="text-amber-700"
        />
        <SummaryStat
          label="Active"
          value={counts.ACTIVE}
          valueClassName="text-primary"
        />
        <SummaryStat
          label="Deactivated"
          value={counts.DEACTIVATED}
          valueClassName="text-slate-400"
        />
      </section>

      <section
        aria-label="Trainer queue controls"
        className="rounded-2xl border border-[#dfe7e2] bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            action="/dashboard/admin/trainers"
            className="flex w-full max-w-md items-center rounded-xl border border-slate-200 bg-slate-50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          >
            <SearchIcon />
            <label htmlFor="trainer-search" className="sr-only">
              Search trainers
            </label>
            <input
              id="trainer-search"
              name="query"
              type="search"
              defaultValue={query}
              placeholder="Search name, username, email, or sport"
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-navy outline-none placeholder:text-slate-400"
            />
            {activeFilter !== "ALL" && (
              <input
                type="hidden"
                name="status"
                value={activeFilter.toLocaleLowerCase("en-PH")}
              />
            )}
            <button
              type="submit"
              className="mr-1 flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-primary transition-colors hover:bg-primary-soft"
            >
              Search
            </button>
          </form>

          <nav
            aria-label="Filter applications by status"
            className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1"
          >
            {FILTERS.map((filter) => {
              const selected = activeFilter === filter.value;
              const count =
                filter.value === "ALL" ? profiles.length : counts[filter.value];
              return (
                <Link
                  key={filter.value}
                  href={trainerFilterHref(filter.value, query)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs transition-colors ${
                    selected
                      ? "bg-white font-bold text-navy shadow-sm"
                      : "font-semibold text-slate-600 hover:bg-white"
                  }`}
                >
                  {filter.label}
                  <span className="ml-1.5 text-slate-400">{count}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <section aria-labelledby="review-queue-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 id="review-queue-title" className="text-sm font-bold text-navy">
              Application queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {visibleProfiles.length} trainer {visibleProfiles.length === 1 ? "profile" : "profiles"} shown
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(query || activeFilter !== "ALL") && (
              <Link
                href="/dashboard/admin/trainers"
                className="text-xs font-bold text-primary hover:text-primary-hover"
              >
                Clear filters
              </Link>
            )}
            <p className="hidden text-xs font-medium text-slate-400 sm:block">
              Select a row to review details
            </p>
          </div>
        </div>

        {visibleProfiles.map((profile, index) => (
          <TrainerReviewRow
            key={profile.id}
            profile={profile}
            defaultOpen={index === 0}
          />
        ))}

        {profiles.length === 0 && <NoTrainerProfiles />}
        {profiles.length > 0 && visibleProfiles.length === 0 && (
          <NoMatchingProfiles query={query} />
        )}
      </section>
    </div>
  );
}

function TrainerReviewRow({
  profile,
  defaultOpen,
}: {
  profile: TrainerReviewProfile;
  defaultOpen: boolean;
}) {
  const name =
    profile.user.playerName ?? profile.user.name ?? profile.user.email;
  const paymentReady = trainerPaymentReady(profile);
  const readiness = trainerReadiness(profile, paymentReady);
  const approvalReady =
    profile.status === "PENDING" &&
    Object.values(readiness).every(Boolean);
  const facebookReviewed = Boolean(profile.facebookReviewedAt);

  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm open:border-primary/30 open:shadow-[0_1px_2px_rgba(16,36,58,0.04),0_8px_24px_rgba(16,36,58,0.035)]"
    >
      <summary className="cursor-pointer list-none px-4 py-4 transition-colors marker:content-none hover:bg-slate-50 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar src={profile.user.image} name={name} size={44} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-black text-navy sm:text-base">
                  {name}
                </h3>
                <Badge tone={statusTone(profile.status)}>{profile.status}</Badge>
              </div>
              <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                @{profile.user.username ?? "no-username"} · {profile.user.email} · {profile.user.phone ?? "No phone"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 xl:w-[490px]">
            <CompactFact
              label="Rate"
              value={
                profile.hourlyRate
                  ? `${formatPHP(Number(profile.hourlyRate))}/hour`
                  : "Missing"
              }
              bad={!profile.hourlyRate}
            />
            <CompactFact
              label="Sports"
              value={profile.sports.join(", ") || "Missing"}
              bad={profile.sports.length === 0}
            />
            <CompactFact
              label="Schedule"
              value={`${profile.weeklyRules.length} ${profile.weeklyRules.length === 1 ? "window" : "windows"}`}
              bad={profile.weeklyRules.length === 0}
            />
            <CompactFact
              label="Payment"
              value={paymentReady ? `${titleCase(profile.paymentMode)} ready` : "Not ready"}
              bad={!paymentReady}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:w-[250px] xl:justify-end">
            <ReadinessChip ready={paymentReady} readyLabel="Payment ready" missingLabel="Payment missing" />
            <ReadinessChip
              ready={Boolean(profile.facebookPage)}
              readyLabel={facebookReviewed ? "Page reviewed" : "Page provided"}
              missingLabel="Facebook missing"
              informational={Boolean(profile.facebookPage)}
            />
            <span className="ml-auto inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary xl:ml-0">
              Review details
              <ChevronIcon />
            </span>
          </div>
        </div>
      </summary>

      <div className="border-t border-[#dfe7e2] bg-[#f7faf8] p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReviewSection title="Public profile" icon={<ProfileIcon />}>
              <ReviewDefinition label="General area">
                {profile.area ?? "Missing"} · In person
              </ReviewDefinition>
              <ReviewDefinition label="Specialties">
                {profile.specialties.join(", ") || "Missing"}
              </ReviewDefinition>
              <ReviewDefinition label="Bio">
                {profile.bio ?? "Missing"}
              </ReviewDefinition>
            </ReviewSection>

            <ReviewSection title="Review information" icon={<DocumentIcon />}>
              <ReviewDefinition label="Private fulfillment instructions">
                {profile.locationDetails ?? "Missing"}
              </ReviewDefinition>
              <ReviewDefinition label="Experience">
                {profile.experience ?? "Missing"}
              </ReviewDefinition>
              <ReviewDefinition label="Certifications">
                {profile.certifications ?? "Not provided"}
              </ReviewDefinition>
            </ReviewSection>

            <section className="rounded-xl border border-[#dfe7e2] bg-white p-4 sm:col-span-2">
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-navy">
                Facebook verification
              </h4>
              {profile.facebookPage ? (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="break-all text-sm font-semibold text-navy">
                      {profile.facebookPage}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {facebookReviewed
                        ? "Reviewed when this trainer was approved."
                        : "Open the public Page and verify the trainer identity before approval."}
                    </p>
                  </div>
                  <a
                    href={profile.facebookPage}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10 px-4 text-xs font-bold text-[#1877F2] transition-colors hover:bg-[#1877F2]/15"
                  >
                    Inspect Facebook Page ↗
                  </a>
                </div>
              ) : (
                <p className="mt-3 text-sm font-semibold text-red-600">
                  Required Facebook Page is missing.
                </p>
              )}
            </section>
          </div>

          <aside className="h-fit rounded-xl border border-[#dfe7e2] bg-white p-4">
            <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-navy">
              Readiness and actions
            </h4>
            <ul className="mt-3 space-y-2.5 text-xs">
              <ReadinessItem label="Photo and phone" ready={readiness.identity} />
              <ReadinessItem label="Public trainer details" ready={readiness.profile} />
              <ReadinessItem label="Weekly schedule" ready={readiness.schedule} />
              <ReadinessItem label="Facebook Page" ready={readiness.facebook} />
              <ReadinessItem
                label={`${titleCase(profile.paymentMode)} payment`}
                ready={readiness.payment}
              />
            </ul>

            <form action={decideTrainerApplicationAction} className="mt-4">
              <input type="hidden" name="trainerProfileId" value={profile.id} />
              <input type="hidden" name="action" value="APPROVE" />
              <button
                disabled={!approvalReady}
                className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {approvalButtonLabel(profile.status, approvalReady)}
              </button>
            </form>
            {!approvalReady && profile.status === "PENDING" && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Complete every readiness requirement before approval.
              </p>
            )}

            {profile.status !== "DEACTIVATED" ? (
              <form
                action={decideTrainerApplicationAction}
                className="mt-3 border-t border-red-100 pt-3"
              >
                <input type="hidden" name="trainerProfileId" value={profile.id} />
                <input type="hidden" name="action" value="DEACTIVATE" />
                <label
                  htmlFor={`deactivate-reason-${profile.id}`}
                  className="text-xs font-bold text-red-700"
                >
                  Deactivate profile
                </label>
                <input
                  id={`deactivate-reason-${profile.id}`}
                  name="reason"
                  required
                  minLength={3}
                  placeholder="Required reason"
                  className="mt-2 min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm text-navy outline-none focus:border-red-500"
                />
                <button className="mt-2 min-h-11 w-full rounded-xl bg-red-50 px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-100">
                  Deactivate
                </button>
              </form>
            ) : (
              <div className="mt-3 border-t border-red-100 pt-3">
                <p className="text-xs font-bold text-red-700">Deactivated</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {profile.deactivationReason ?? "No reason was recorded."}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </details>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName = "text-navy",
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="border-b border-r border-[#dfe7e2] px-4 py-3.5 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function CompactFact({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xs font-bold ${bad ? "text-red-600" : "text-navy"}`}>
        {value}
      </p>
    </div>
  );
}

function ReadinessChip({
  ready,
  readyLabel,
  missingLabel,
  informational = false,
}: {
  ready: boolean;
  readyLabel: string;
  missingLabel: string;
  informational?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold ${
        ready
          ? informational
            ? "bg-ocean-soft text-ocean"
            : "bg-primary-soft text-primary"
          : "bg-red-50 text-red-600"
      }`}
    >
      {ready ? <CheckIcon /> : <AlertIcon />}
      {ready ? readyLabel : missingLabel}
    </span>
  );
}

function ReviewSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#dfe7e2] bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-navy">
        {icon}
        {title}
      </h4>
      <dl className="mt-3 space-y-3 text-sm">{children}</dl>
    </section>
  );
}

function ReviewDefinition({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm leading-5 text-slate-600">
        {children}
      </dd>
    </div>
  );
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`inline-flex items-center gap-1 font-bold ${ready ? "text-primary" : "text-red-600"}`}>
        {ready ? <CheckIcon /> : <AlertIcon />}
        {ready ? "Ready" : "Missing"}
      </span>
    </li>
  );
}

function NoTrainerProfiles() {
  return (
    <div className="rounded-2xl border border-dashed border-[#dfe7e2] bg-white p-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <InboxIcon />
      </div>
      <h3 className="mt-3 text-sm font-bold text-navy">No trainer profiles yet</h3>
      <p className="mt-1 text-sm text-slate-500">
        Trainer applications will appear here when players start their trainer setup.
      </p>
    </div>
  );
}

function NoMatchingProfiles({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#dfe7e2] bg-white p-8 text-center">
      <h3 className="text-sm font-bold text-navy">No matching applications</h3>
      <p className="mt-1 text-sm text-slate-500">
        {query
          ? `No trainer profiles match “${query}” and the selected status.`
          : "No trainer profiles match the selected status."}
      </p>
      <Link
        href="/dashboard/admin/trainers"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-soft px-4 text-sm font-bold text-primary"
      >
        Clear filters
      </Link>
    </div>
  );
}

function trainerReadiness(profile: TrainerReviewProfile, paymentReady: boolean) {
  return {
    identity: Boolean(
      profile.user.username && profile.user.image && profile.user.phone
    ),
    profile: Boolean(
      profile.bio &&
        profile.sports.length > 0 &&
        profile.specialties.length > 0 &&
        profile.experience &&
        profile.area &&
        profile.locationDetails &&
        profile.hourlyRate
    ),
    schedule: profile.weeklyRules.length > 0,
    facebook: Boolean(profile.facebookPage),
    payment: paymentReady,
  };
}

function approvalButtonLabel(status: TrainerStatus, approvalReady: boolean) {
  if (status === "ACTIVE") return "Already active";
  if (status === "DEACTIVATED") return "Profile deactivated";
  if (status === "DRAFT") return "Awaiting submission";
  return approvalReady ? "Approve trainer" : "Setup incomplete";
}

function parseTrainerFilter(value: string): TrainerFilter {
  const normalized = value.toLocaleUpperCase("en-PH");
  return FILTERS.some((filter) => filter.value === normalized)
    ? (normalized as TrainerFilter)
    : "ALL";
}

function trainerFilterHref(filter: TrainerFilter, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (filter !== "ALL") {
    params.set("status", filter.toLocaleLowerCase("en-PH"));
  }
  const suffix = params.toString();
  return suffix ? `/dashboard/admin/trainers?${suffix}` : "/dashboard/admin/trainers";
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusTone(status: TrainerStatus): BadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING") return "warn";
  if (status === "DEACTIVATED") return "danger";
  return "neutral";
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLocaleLowerCase("en-PH");
}

function InboxIcon() {
  return (
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
      className="text-primary"
    >
      <path d="M4 4h16v13H4z" />
      <path d="m4 13 4 4h8l4-4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="ml-3 shrink-0 text-slate-400"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-primary"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-primary"
    >
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}
