import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { EventRegistrationPanel } from "@/components/events/EventRegistrationPanel";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { getViewer } from "@/lib/dal";
import { buildEventMetadata } from "@/lib/event-metadata";
import { getPublicEvent } from "@/lib/events";
import { absoluteUrl } from "@/lib/site";
import {
  formatManilaDateLong,
  formatSlotRange,
} from "@/lib/time";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const event = await getPublicEvent(publicId);
  if (!event) return { title: "Event not found — Bunal.club" };
  const description =
    event.description ??
    `${event.sport} open play at ${event.hub.name} on ${formatManilaDateLong(event.date)}.`;
  return buildEventMetadata({
    publicId: event.publicId,
    title: event.title,
    description,
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const viewer = await getViewer();
  const event = await getPublicEvent(publicId, viewer?.id);
  if (!event) notFound();

  const cancelled = event.status === "CANCELLED";
  const ended = event.endsAt <= new Date();
  const closed = cancelled || ended;
  const courtNames = event.courts.map((court) => court.name).join(", ");
  const duration = event.endHour - event.startHour;
  const eventUrl = absoluteUrl(`/events/${event.publicId}`);
  const featuredAttendees = event.attendees.slice(0, 4);
  const remainingAttendees = event.attendees.slice(4);

  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="min-w-0 py-6 sm:py-12">
        <div className="grid min-w-0 gap-8 lg:grid-cols-12 lg:gap-12">
            <section className="order-1 min-w-0 lg:col-span-8">
              <div className="relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-3xl bg-navy sm:aspect-[21/9] sm:min-h-52">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(163,206,60,0.2)_1px,transparent_0)] bg-[size:24px_24px]" />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/35 via-transparent to-ocean/35" />
                <p className="relative text-5xl font-black lowercase tracking-[-0.08em] text-white/10 sm:text-7xl">
                  bunal.club
                </p>
                <div className="absolute right-5 top-5">
                  <ShareEventButton title={event.title} url={eventUrl} />
                </div>
              </div>

              <div className="mt-7">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={cancelled ? "danger" : ended ? "neutral" : "primary"} className="uppercase tracking-[0.15em]">
                    {cancelled ? "Cancelled" : ended ? "Past event" : "Open play"}
                  </Badge>
                  {event.series ? (
                    <Badge tone="neutral">
                      Weekly event {event.series.position} of {event.series.total}
                    </Badge>
                  ) : null}
                  <Link
                    href={`/hubs/${event.hub.slug ?? event.hub.id}`}
                    className="text-sm font-bold text-ocean hover:text-navy"
                  >
                    {event.hub.name}
                  </Link>
                  {event.liveQueuePublicId ? (
                    <Link
                      href={`/q/${event.liveQueuePublicId}`}
                      className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary hover:bg-accent-soft"
                    >
                      BunalQ live
                    </Link>
                  ) : null}
                </div>
                <h1 className="mt-5 break-words text-3xl font-black uppercase leading-[1.08] tracking-[-0.04em] text-navy sm:text-5xl">
                  {event.title}
                </h1>
                {event.description && (
                  <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
                    {event.description}
                  </p>
                )}
                {cancelled && (
                  <p className="mt-5 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">
                    {event.cancelReason ?? "This event was cancelled by the organizer."}
                  </p>
                )}
              </div>
            </section>

            <section className="order-2 grid min-w-0 gap-4 sm:grid-cols-2 lg:col-span-8">
              <EventFact icon={<CalendarIcon />} label="Date & time">
                <strong>{formatManilaDateLong(event.date)}</strong>
                <span>{formatSlotRange(event.startHour, event.endHour)} ({duration}h)</span>
              </EventFact>
              <EventFact icon={<CourtIcon />} label="Venue & courts">
                <strong>{event.hub.name}</strong>
                <span>{courtNames}</span>
              </EventFact>
              <EventFact icon={<PlayersIcon />} label="Attendance">
                <strong>{event.capacity} player capacity</strong>
                <span>
                  {event.confirmedCount} confirmed
                  {event.pendingCount > 0 && ` · ${event.pendingCount} in checkout`}
                </span>
                <span>{event.remainingSpots} available</span>
              </EventFact>
              <EventFact icon={<StatusIcon />} label="Status">
                <strong>{closed ? "Registration closed" : event.full ? "Waitlist open" : "Registration open"}</strong>
                <span>
                  {event.full && !closed
                    ? `${event.waitlistedCount} on the waitlist`
                    : event.registrationFee > 0
                      ? event.hub.paymentMode === "MANUAL"
                        ? "Paid spots confirm after venue review"
                        : "Paid spots confirm immediately"
                      : "Free spots confirm immediately"}
                </span>
              </EventFact>
            </section>

            <aside className="order-3 min-w-0 lg:col-span-4 lg:col-start-9 lg:row-span-4 lg:row-start-1">
              <div className="lg:sticky lg:top-24 lg:space-y-6">
                <div className="min-w-0">
                  <EventRegistrationPanel
                    publicId={event.publicId}
                    fee={event.registrationFee}
                    paymentMode={event.hub.paymentMode}
                    signedIn={Boolean(viewer)}
                    viewerName={
                      viewer?.playerName ?? viewer?.name ?? "Player"
                    }
                    viewerRole={viewer?.role}
                    registration={event.viewerRegistration}
                    remainingSpots={event.remainingSpots}
                    full={event.full}
                    closed={closed}
                  />
                </div>

                <div className="hidden lg:block">
                  <EventOrganizerCard
                    publicId={event.publicId}
                    hub={event.hub}
                    canManage={viewer?.id === event.ownerId}
                  />
                </div>
              </div>
            </aside>

            <section className="order-4 min-w-0 lg:col-span-8">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-2xl font-black uppercase tracking-tight text-navy">
                  Who&apos;s coming
                </h2>
                <span className="text-sm font-bold text-primary">
                  {event.confirmedCount} confirmed
                </span>
              </div>
              {event.attendees.length > 0 ? (
                <div className="mt-5 rounded-3xl border border-primary/15 bg-primary-soft/40 p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    Confirmed roster
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                    {featuredAttendees.map((player) => {
                      const displayName = player.playerName ?? player.name ?? "Player";
                      return (
                        <EventAttendeeChip
                          key={player.id}
                          image={player.image}
                          displayName={displayName}
                        />
                      );
                    })}
                  </div>

                  {remainingAttendees.length > 0 && (
                    <details className="group mt-4">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl border border-primary/15 bg-white px-3 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-white/70 sm:gap-3 sm:px-4 sm:text-sm [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-2 sm:gap-3">
                          <span className="flex shrink-0 -space-x-2" aria-hidden="true">
                            {event.attendees.slice(0, 3).map((player) => {
                              const displayName = player.playerName ?? player.name ?? "Player";
                              return (
                                <Avatar
                                  key={player.id}
                                  src={player.image}
                                  name={displayName}
                                  size={28}
                                  className="ring-2 ring-white"
                                />
                              );
                            })}
                          </span>
                          <span className="truncate group-open:hidden">
                            View all {event.confirmedCount} players
                          </span>
                          <span className="hidden truncate group-open:inline">
                            Show fewer players
                          </span>
                        </span>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                          className="shrink-0 transition-transform group-open:rotate-180"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </summary>

                      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                        {remainingAttendees.map((player) => {
                          const displayName = player.playerName ?? player.name ?? "Player";
                          return (
                            <EventAttendeeChip
                              key={player.id}
                              image={player.image}
                              displayName={displayName}
                            />
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
                  No confirmed players yet. Be the first to join.
                </p>
              )}
            </section>

            <section className="order-5 min-w-0 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-8">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Hub policy
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cancellations and refunds for this event are managed directly
                by the hub owner. Contact the organizer if your plans change.
              </p>
            </section>

            <div className="order-6 min-w-0 lg:hidden">
              <EventOrganizerCard
                publicId={event.publicId}
                hub={event.hub}
                canManage={viewer?.id === event.ownerId}
              />
            </div>
        </div>
      </div>
    </PageShell>
  );
}

function EventOrganizerCard({
  publicId,
  hub,
  canManage,
}: {
  publicId: string;
  hub: {
    id: string;
    slug: string | null;
    name: string;
    logo: string | null;
    verified: boolean;
  };
  canManage: boolean;
}) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 lg:mt-6">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
        Organizer
      </p>
      <div className="mt-5 flex min-w-0 items-center gap-4">
        <Avatar src={hub.logo} name={hub.name} size={54} shape="rounded" />
        <div className="min-w-0">
          <p className="truncate font-black uppercase text-navy">{hub.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {hub.verified ? "Verified venue partner" : "Venue partner"}
          </p>
        </div>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-5">
        <Link
          href={`/hubs/${hub.slug ?? hub.id}`}
          className="text-sm font-bold text-primary hover:underline"
        >
          View venue profile →
        </Link>
        {canManage && (
          <Link
            href={`/dashboard/events/${publicId}/edit`}
            className="mt-3 block text-sm font-bold text-navy hover:underline"
          >
            Manage this event →
          </Link>
        )}
      </div>
    </div>
  );
}

function EventFact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className="mt-1.5 flex min-w-0 flex-col gap-0.5 break-words text-sm text-slate-500 [&_strong]:text-navy">{children}</div>
      </div>
    </div>
  );
}

function EventAttendeeChip({
  image,
  displayName,
}: {
  image: string | null;
  displayName: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/80 bg-white/90 p-2.5 shadow-sm shadow-navy/5">
      <Avatar src={image} name={displayName} size={32} />
      <p className="min-w-0 truncate text-sm font-bold text-navy">
        {displayName}
      </p>
    </div>
  );
}

const iconProps = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;
function CalendarIcon() { return <svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>; }
function CourtIcon() { return <svg {...iconProps}><path d="M4 4h16v16H4zM12 4v16M4 12h16" /></svg>; }
function PlayersIcon() { return <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function StatusIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>; }
