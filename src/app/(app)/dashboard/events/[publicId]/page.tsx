import type {
  EventRegistrationStatus,
  PaymentStatus,
} from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelEventPanel } from "@/components/events/CancelEventPanel";
import { ManualPaymentReview } from "@/components/bookings/ManualPaymentReview";
import { DeleteCancelledEventButton } from "@/components/events/DeleteCancelledEventButton";
import { EventForm } from "@/components/events/EventForm";
import { OrganizerGuestPanel } from "@/components/events/OrganizerGuestPanel";
import {
  OwnerEventRegistrations,
  type OwnerEventParticipant,
} from "@/components/events/OwnerEventRegistrations";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import {
  getOwnerEventDetails,
  listEventFormHubs,
} from "@/lib/events";
import {
  formatManilaDateLong,
  formatSlotRange,
  manilaToday,
} from "@/lib/time";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Event details — Bunal.club",
};

type EventTab = "overview" | "players" | "payments" | "settings";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const tabs: { value: EventTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "players", label: "Players" },
  { value: "payments", label: "Payments" },
  { value: "settings", label: "Settings" },
];
const registrationStatuses: EventRegistrationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "CANCELLED",
  "EXPIRED",
];
const paymentStatuses: PaymentStatus[] = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
];
const PAGE_SIZE = 20;

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function eventDetailsHref(
  publicId: string,
  tab: EventTab,
  values: {
    query?: string;
    registrationStatus?: string;
    paymentStatus?: string;
    page?: number;
  } = {}
): string {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (values.query) params.set("q", values.query);
  if (values.registrationStatus) {
    params.set("registration", values.registrationStatus);
  }
  if (values.paymentStatus) params.set("payment", values.paymentStatus);
  if (values.page && values.page > 1) params.set("page", String(values.page));
  const query = params.toString();
  return `/dashboard/events/${publicId}${query ? `?${query}` : ""}`;
}

function statusTone(status: string): BadgeTone {
  if (status === "PUBLISHED" || status === "CONFIRMED" || status === "SUCCEEDED") {
    return "success";
  }
  if (status === "PENDING" || status === "WAITLISTED") return "warn";
  if (status === "CANCELLED" || status === "FAILED" || status === "REFUNDED") {
    return "danger";
  }
  return "neutral";
}

function paymentDate(value: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function PartnerEventDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: SearchParams;
}) {
  const workspace = await requirePartnerWorkspace("events");
  const canManage = hasStaffAccess(workspace, "events", "MANAGE");
  const canUseOpenPlay = hasStaffAccess(workspace, "openPlay", "VIEW");
  const canMessage = hasStaffAccess(workspace, "messages", "VIEW");
  const [{ publicId }, queryParams] = await Promise.all([params, searchParams]);
  const requestedTab = firstSearchValue(queryParams.tab) as EventTab;
  const tab = tabs.some((item) => item.value === requestedTab)
    ? requestedTab
    : "overview";
  const event = await getOwnerEventDetails(publicId, workspace.partnerId);
  if (!event) notFound();

  const query = firstSearchValue(queryParams.q).trim().slice(0, 100);
  const requestedRegistrationStatus = firstSearchValue(
    queryParams.registration
  ) as EventRegistrationStatus;
  const registrationStatus = registrationStatuses.includes(
    requestedRegistrationStatus
  )
    ? requestedRegistrationStatus
    : "";
  const requestedPaymentStatus = firstSearchValue(
    queryParams.payment
  ) as PaymentStatus;
  const paymentStatus = paymentStatuses.includes(requestedPaymentStatus)
    ? requestedPaymentStatus
    : "";
  const requestedPage = Number.parseInt(firstSearchValue(queryParams.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  const matchingPlayers = event.registrations.filter((registration) => {
    const name = (
      registration.player.playerName ??
      registration.player.name ??
      "Player"
    ).toLowerCase();
    const matchesQuery =
      !query ||
      name.includes(query.toLowerCase()) ||
      registration.player.email.toLowerCase().includes(query.toLowerCase()) ||
      registration.guestNames.some((guest) =>
        guest.toLowerCase().includes(query.toLowerCase())
      ) ||
      registration.pendingGuestNames.some((guest) =>
        guest.toLowerCase().includes(query.toLowerCase())
      );
    const matchesStatus =
      !registrationStatus || registration.status === registrationStatus;
    return matchesQuery && matchesStatus;
  });
  const matchingOrganizerGuests = event.organizerGuests.filter((guest) => {
    const matchesQuery =
      !query || guest.name.toLowerCase().includes(query.toLowerCase());
    const matchesStatus =
      !registrationStatus || guest.status === registrationStatus;
    return matchesQuery && matchesStatus;
  });
  const matchingParticipants: OwnerEventParticipant[] = [
    ...matchingPlayers.map((registration) => ({
      kind: "registration" as const,
      createdAt: registration.createdAt,
      registration,
    })),
    ...matchingOrganizerGuests.map((guest) => ({
      kind: "organizerGuest" as const,
      createdAt: guest.createdAt,
      guest,
    })),
  ].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  );
  const matchingPayments = event.registrations
    .flatMap((registration) => [
      ...(registration.payment
        ? [{ registration, payment: registration.payment, addOn: false }]
        : []),
      ...registration.additionalPayments.map((payment) => ({
        registration,
        payment,
        addOn: true,
      })),
    ])
    .filter(({ registration, payment }) => {
      const name = (
        registration.player.playerName ??
        registration.player.name ??
        "Player"
      ).toLowerCase();
      const matchesQuery =
        !query ||
        name.includes(query.toLowerCase()) ||
        registration.player.email.toLowerCase().includes(query.toLowerCase()) ||
        registration.guestNames.some((guest) =>
          guest.toLowerCase().includes(query.toLowerCase())
        ) ||
        payment.providerRef?.toLowerCase().includes(
          query.toLowerCase()
        );
      const matchesStatus =
        !paymentStatus || payment.status === paymentStatus;
      return matchesQuery && matchesStatus;
    })
    .sort(
      (left, right) =>
        (right.payment.paidAt ?? right.registration.createdAt).getTime() -
        (left.payment.paidAt ?? left.registration.createdAt).getTime()
    );
  const resultSet =
    tab === "payments" ? matchingPayments : matchingParticipants;
  const pageCount = Math.max(1, Math.ceil(resultSet.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleParticipants = matchingParticipants.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const visiblePayments = matchingPayments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const hubs = tab === "settings" && canManage
    ? await listEventFormHubs(workspace.partnerId)
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/events"
          className="text-sm font-bold text-primary hover:underline"
        >
          ← Back to events
        </Link>
        <Link
          href={`/events/${event.publicId}`}
          target="_blank"
          className="text-sm font-bold text-navy hover:underline"
        >
          View public page ↗
        </Link>
        {canUseOpenPlay && event.sport === "pickleball" && event.status !== "DRAFT" ? (
          <Link
            href={`/dashboard/events/${event.publicId}/bunalq`}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-hover"
          >
            BunalQ console
          </Link>
        ) : null}
      </div>

      <header className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-navy/5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
                Event details
              </p>
              <Badge tone={statusTone(event.status)}>{event.status}</Badge>
              {event.seriesOccurrences.length > 1 ? (
                <Badge tone="primary">
                  Weekly series · {event.seriesOccurrences.findIndex(
                    (occurrence) => occurrence.publicId === event.publicId
                  ) + 1} of {event.seriesOccurrences.length}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-navy">
              {event.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {formatManilaDateLong(event.date)} ·{" "}
              {formatSlotRange(event.startHour, event.endHour)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {event.hub.name} ·{" "}
              {event.courts.map((court) => court.name).join(", ")}
            </p>
          </div>
          <div className="rounded-2xl bg-primary-soft px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
              Registration
            </p>
            <p className="mt-1 text-lg font-black text-navy">
              {event.registrationFee > 0
                ? formatPHP(event.registrationFee)
                : "Free"}
            </p>
            {canMessage && event.status === "PUBLISHED" && event.confirmedCount > 0 && (
              <Link
                href="/dashboard/messages"
                className="mt-2 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-hover"
              >
                Open discussion
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1"
        aria-label="Event details"
      >
        {tabs.map((item) => (
          <Link
            key={item.value}
            href={eventDetailsHref(event.publicId, item.value)}
            className={`min-h-10 shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              tab === item.value
                ? "bg-navy text-white"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="mt-6 space-y-6">
          {event.seriesOccurrences.length > 1 ? (
            <section className="rounded-3xl border border-ocean/20 bg-ocean-soft/50 p-5 sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ocean">
                Weekly series
              </p>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {event.seriesOccurrences.map((occurrence) => {
                  const current = occurrence.publicId === event.publicId;
                  return (
                    <Link
                      key={occurrence.publicId}
                      href={`/dashboard/events/${occurrence.publicId}`}
                      aria-current={current ? "page" : undefined}
                      className={`min-w-36 rounded-2xl border px-4 py-3 transition-colors ${
                        current
                          ? "border-ocean bg-white shadow-sm"
                          : "border-transparent bg-white/70 hover:border-ocean/30"
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-ocean">
                        Event {occurrence.position}
                      </span>
                      <span className="mt-1 block text-sm font-black text-navy">
                        {formatManilaDateLong(occurrence.date)}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {occurrence.status}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Each week has its own players, payments, settings, and cancellation history.
              </p>
            </section>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Confirmed players"
              value={String(event.confirmedCount)}
              hint={`of ${event.capacity} capacity`}
            />
            <StatCard
              label="Remaining spots"
              value={String(event.remainingSpots)}
              hint={
                event.pendingCount > 0
                  ? `${event.pendingCount} active payment hold${event.pendingCount === 1 ? "" : "s"} included`
                  : "No active payment holds"
              }
            />
            <StatCard
              label="Waitlisted"
              value={String(event.waitlistedCount)}
              hint="Free waitlist registrations"
            />
            <StatCard
              label="Partner revenue"
              value={formatPHP(event.finance.partnerRevenue)}
              hint="Succeeded registration payments"
              accent
            />
          </dl>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                Event information
              </p>
              <h2 className="mt-2 text-xl font-black text-navy">
                What players see
              </h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <Detail label="Sport" value={event.sport} />
                <Detail
                  label="Capacity"
                  value={`${event.capacity} players`}
                />
                <Detail label="Hub" value={event.hub.name} />
                <Detail
                  label="Courts"
                  value={event.courts
                    .map((court) => court.name)
                    .join(", ")}
                />
              </dl>
              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                  Description
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {event.description || "No event description added."}
                </p>
              </div>
              {event.status === "CANCELLED" && event.cancelReason ? (
                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-red-600">
                    Cancellation reason
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    {event.cancelReason}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ocean">
                Financial summary
              </p>
              <h2 className="mt-2 text-xl font-black text-navy">
                Registration payments
              </h2>
              <dl className="mt-5 divide-y divide-slate-100">
                <MoneyRow
                  label="Checkout subtotal collected"
                  value={formatPHP(event.finance.checkoutSubtotal)}
                />
                <MoneyRow
                  label="Your registration revenue"
                  value={formatPHP(event.finance.partnerRevenue)}
                  strong
                />
                <MoneyRow
                  label="Bunal.club service fees"
                  value={formatPHP(event.finance.platformFees)}
                />
                <MoneyRow
                  label="Refunded venue revenue"
                  value={formatPHP(event.finance.refundedPartnerRevenue)}
                />
              </dl>
              <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-center">
                <PaymentCount
                  value={event.finance.successfulPayments}
                  label="Succeeded"
                />
                <PaymentCount
                  value={event.finance.pendingPayments}
                  label="Pending"
                />
                <PaymentCount
                  value={event.finance.refundedPayments}
                  label="Refunded"
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-400">
                PayMongo&apos;s pass-on processing fee is paid separately by
                the player and is not included in these stored subtotals.
              </p>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "players" ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                Players
              </p>
              <h2 className="mt-2 text-2xl font-black text-navy">
                Registrations
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Search players, review registration status, and manage spots.
              </p>
            </div>
            {canManage && event.status === "PUBLISHED" && event.startsAt > new Date() ? (
              <OrganizerGuestPanel
                eventId={event.id}
                remainingSpots={event.remainingSpots}
              />
            ) : (
              <span className="text-sm font-bold text-slate-500">
                {matchingParticipants.length} result
                {matchingParticipants.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <EventFilter
            publicId={event.publicId}
            tab="players"
            query={query}
            status={registrationStatus}
            statuses={registrationStatuses}
          />
          <div className="mt-5">
            <OwnerEventRegistrations
              participants={visibleParticipants}
              canManage={canManage}
            />
          </div>
          <Pagination
            publicId={event.publicId}
            tab="players"
            query={query}
            registrationStatus={registrationStatus}
            page={currentPage}
            pageCount={pageCount}
          />
        </section>
      ) : null}

      {tab === "payments" ? (
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ocean">
                  Payments
                </p>
                <h2 className="mt-2 text-2xl font-black text-navy">
                  Registration transactions
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Checkout totals, venue revenue, service fees, and references.
                </p>
              </div>
              <span className="text-sm font-bold text-slate-500">
                {matchingPayments.length} result
                {matchingPayments.length === 1 ? "" : "s"}
              </span>
            </div>
            <EventFilter
              publicId={event.publicId}
              tab="payments"
              query={query}
              status={paymentStatus}
              statuses={paymentStatuses}
            />
          </div>
          {visiblePayments.length > 0 ? (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Player</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Checkout</th>
                    <th className="px-4 py-3 text-right">Venue revenue</th>
                    <th className="px-4 py-3 text-right">Bunal fee</th>
                    <th className="px-6 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visiblePayments.map(({ registration, payment, addOn }) => {
                    const name =
                      registration.player.playerName ??
                      registration.player.name ??
                      "Player";
                    return (
                      <tr key={payment.id}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-navy">{name}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {paymentDate(
                              payment.paidAt ?? registration.createdAt
                            )}
                            {addOn && " · Guest add-on"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={statusTone(payment.status)}>
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-navy">
                          {formatPHP(payment.amount)}
                        </td>
                        <td className="px-4 py-4 text-right text-slate-600">
                          {formatPHP(payment.venueAmount)}
                        </td>
                        <td className="px-4 py-4 text-right text-slate-600">
                          {formatPHP(payment.platformFee)}
                        </td>
                        <td className="max-w-56 px-6 py-4 align-middle">
                          {payment.collectionMode !== "MANUAL" && (
                            <p className="truncate font-mono text-xs text-slate-500">
                              {payment.providerRef ?? "Not available"}
                            </p>
                          )}
                          {canManage && payment.collectionMode === "MANUAL" &&
                            payment.manualSubmittedAt && (
                              <ManualPaymentReview
                                variant="eventTable"
                                payment={{
                                  id: payment.id,
                                  status: payment.status,
                                  amount: payment.amount,
                                  venueAmount: payment.venueAmount,
                                  platformFee: payment.platformFee,
                                  playerName: name,
                                  receiptImage: payment.manualReceiptImage,
                                  methodLabel: payment.manualMethodLabel,
                                  paymentReference: payment.manualPaymentRef,
                                  submittedAt: payment.manualSubmittedAt,
                                  reviewNote: payment.manualReviewNote,
                                  refundedAt: payment.refundedAt,
                                }}
                              />
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-slate-100 px-6 py-12 text-center text-sm text-slate-500">
              No payment transactions match these filters.
            </div>
          )}
          <div className="px-5 pb-5 sm:px-7 sm:pb-7">
            <Pagination
              publicId={event.publicId}
              tab="payments"
              query={query}
              paymentStatus={paymentStatus}
              page={currentPage}
              pageCount={pageCount}
            />
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <div className="mt-6 space-y-6">
          {canManage ? (
            <EventForm hubs={hubs} event={event} today={manilaToday()} />
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              You have view-only access to this event. Ask the account owner to grant Events management access to change its settings.
            </section>
          )}
          {canManage && event.status !== "CANCELLED" ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
              <h2 className="text-lg font-black text-navy">Event controls</h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">
                Cancellation releases every selected court-hour and can refund
                successful player payments. Bunal.club service fees remain
                non-refundable.
              </p>
              <CancelEventPanel eventId={event.id} />
            </section>
          ) : canManage ? (
            <section className="rounded-3xl border border-red-100 bg-white p-5 sm:p-7">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
                Cancelled event
              </p>
              <h2 className="mt-2 text-lg font-black text-navy">
                Delete this event
              </h2>
              <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">
                A cancelled event can be deleted only when it has no payment
                history. Financial records must remain available for audit and
                refunds.
              </p>
              <DeleteCancelledEventButton
                eventId={event.id}
                title={event.title}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 ${
        accent
          ? "border-primary/20 bg-primary-soft"
          : "border-slate-200 bg-white"
      }`}
    >
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-black text-navy">{value}</dd>
      <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold capitalize text-navy">{value}</dd>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "font-black text-primary" : "font-bold text-navy"}>
        {value}
      </dd>
    </div>
  );
}

function PaymentCount({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-black text-navy">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function EventFilter({
  publicId,
  tab,
  query,
  status,
  statuses,
}: {
  publicId: string;
  tab: "players" | "payments";
  query: string;
  status: string;
  statuses: readonly string[];
}) {
  return (
    <form
      action={`/dashboard/events/${publicId}`}
      className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_180px_auto]"
    >
      <input type="hidden" name="tab" value={tab} />
      <label>
        <span className="sr-only">Search</span>
        <input
          name="q"
          defaultValue={query}
          placeholder={
            tab === "players"
              ? "Search player, email, or guest"
              : "Search player, email, or reference"
          }
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-navy outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
      </label>
      <label>
        <span className="sr-only">Status</span>
        <select
          name={tab === "players" ? "registration" : "payment"}
          defaultValue={status}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button className="min-h-11 rounded-xl bg-navy px-4 text-sm font-bold text-white hover:bg-navy-hover">
          Apply
        </button>
        {(query || status) && (
          <Link
            href={eventDetailsHref(publicId, tab)}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-white"
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

function Pagination({
  publicId,
  tab,
  query,
  registrationStatus,
  paymentStatus,
  page,
  pageCount,
}: {
  publicId: string;
  tab: "players" | "payments";
  query: string;
  registrationStatus?: string;
  paymentStatus?: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const values = {
    query,
    registrationStatus,
    paymentStatus,
  };
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
      <Link
        href={
          page > 1
            ? eventDetailsHref(publicId, tab, { ...values, page: page - 1 })
            : "#"
        }
        aria-disabled={page <= 1}
        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
          page > 1
            ? "border-slate-200 text-navy hover:bg-slate-50"
            : "pointer-events-none border-slate-100 text-slate-300"
        }`}
      >
        ← Previous
      </Link>
      <p className="text-xs text-slate-500">
        Page {page} of {pageCount}
      </p>
      <Link
        href={
          page < pageCount
            ? eventDetailsHref(publicId, tab, { ...values, page: page + 1 })
            : "#"
        }
        aria-disabled={page >= pageCount}
        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
          page < pageCount
            ? "border-slate-200 text-navy hover:bg-slate-50"
            : "pointer-events-none border-slate-100 text-slate-300"
        }`}
      >
        Next →
      </Link>
    </div>
  );
}
