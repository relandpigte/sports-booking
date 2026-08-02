import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { EventRegistrationPanel } from "@/components/events/EventRegistrationPanel";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { bookingServiceFeeFor } from "@/lib/constants";
import { getViewer } from "@/lib/dal";
import { getPublicEvent } from "@/lib/events";
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
  return {
    title: `${event.title} — Bunal.club`,
    description:
      event.description ??
      `${event.sport} open play at ${event.hub.name} on ${formatManilaDateLong(event.date)}.`,
  };
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
  const serviceFee = bookingServiceFeeFor(event.registrationFee);

  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="py-8 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="space-y-10 lg:col-span-8">
            <section>
              <div className="relative flex aspect-[21/9] min-h-52 items-center justify-center overflow-hidden rounded-3xl bg-navy">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(163,206,60,0.2)_1px,transparent_0)] bg-[size:24px_24px]" />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/35 via-transparent to-ocean/35" />
                <p className="relative text-5xl font-black lowercase tracking-[-0.08em] text-white/10 sm:text-7xl">
                  bunal.club
                </p>
                <div className="absolute right-5 top-5">
                  <ShareEventButton title={event.title} />
                </div>
              </div>

              <div className="mt-7">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={cancelled ? "danger" : ended ? "neutral" : "primary"} className="uppercase tracking-[0.15em]">
                    {cancelled ? "Cancelled" : ended ? "Past event" : "Open play"}
                  </Badge>
                  <Link
                    href={`/hubs/${event.hub.slug ?? event.hub.id}`}
                    className="text-sm font-bold text-ocean hover:text-navy"
                  >
                    {event.hub.name}
                  </Link>
                </div>
                <h1 className="mt-5 text-4xl font-black uppercase leading-[1.05] tracking-[-0.045em] text-navy sm:text-5xl">
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

            <section className="grid gap-4 sm:grid-cols-2">
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
                <span>{event.confirmedCount} registered · {event.remainingSpots} remaining</span>
              </EventFact>
              <EventFact icon={<StatusIcon />} label="Status">
                <strong>{closed ? "Registration closed" : event.full ? "Waitlist open" : "Registration open"}</strong>
                <span>{event.full && !closed ? `${event.waitlistedCount} on the waitlist` : event.registrationFee > 0 ? "Paid spots confirm immediately" : "Free spots confirm immediately"}</span>
              </EventFact>
            </section>

            <section>
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-2xl font-black uppercase tracking-tight text-navy">
                  Who&apos;s coming
                </h2>
                <span className="text-sm font-bold text-primary">
                  {event.confirmedCount} confirmed
                </span>
              </div>
              {event.attendees.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {event.attendees.map((player) => {
                    const displayName = player.playerName ?? player.name ?? "Player";
                    return (
                      <div key={player.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                        <Avatar src={player.image} name={displayName} size={46} shape="rounded" />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-navy">{displayName}</p>
                          <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-primary">
                            Confirmed player
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
                  No confirmed players yet. Be the first to join.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Hub policy
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cancellations and refunds for this event are managed directly
                by the hub owner. Contact the organizer if your plans change.
              </p>
            </section>
          </div>

          <aside className="space-y-6 lg:col-span-4">
            <div className="lg:sticky lg:top-24 lg:space-y-6">
              <EventRegistrationPanel
                publicId={event.publicId}
                fee={event.registrationFee}
                serviceFee={serviceFee}
                signedIn={Boolean(viewer)}
                viewerRole={viewer?.role}
                registration={event.viewerRegistration}
                full={event.full}
                closed={closed}
              />

              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Organizer
                </p>
                <div className="mt-5 flex items-center gap-4">
                  <Avatar src={event.hub.logo} name={event.hub.name} size={54} shape="rounded" />
                  <div className="min-w-0">
                    <p className="truncate font-black uppercase text-navy">{event.hub.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.hub.verified ? "Verified venue partner" : "Venue partner"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <Link href={`/hubs/${event.hub.slug ?? event.hub.id}`} className="text-sm font-bold text-primary hover:underline">
                    View venue profile →
                  </Link>
                  {viewer?.id === event.ownerId && (
                    <Link href={`/dashboard/events/${event.publicId}/edit`} className="mt-3 block text-sm font-bold text-navy hover:underline">
                      Manage this event →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

function EventFact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-slate-500 [&_strong]:text-navy">{children}</div>
      </div>
    </div>
  );
}

const iconProps = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;
function CalendarIcon() { return <svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>; }
function CourtIcon() { return <svg {...iconProps}><path d="M4 4h16v16H4zM12 4v16M4 12h16" /></svg>; }
function PlayersIcon() { return <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function StatusIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>; }
