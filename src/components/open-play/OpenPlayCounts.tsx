import type { OpenPlaySnapshot } from "@/lib/open-play-shared";

// Live counts shown beside the queue title on dark headers: courts in play,
// players checked in and playing, and how many are waiting. Join requests
// only appear for organizers; public snapshots leave pending players out.
export function OpenPlayCounts({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const count = (statuses: string[]) =>
    snapshot.participants.filter((participant) => statuses.includes(participant.status)).length;
  const liveCourts = snapshot.games.filter((game) => game.status === "ACTIVE" && game.courtId).length;
  const players = count(["QUEUED", "STAGED", "PLAYING"]);
  const queued = count(["QUEUED"]);
  const requests = count(["PENDING_APPROVAL"]);
  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] font-bold uppercase tracking-wide text-white/55">
      <div className="flex items-baseline gap-1.5">
        <dt>Courts</dt>
        <dd className="text-base font-black text-white"><span className="text-emerald-400">{liveCourts}</span> / {snapshot.courts.length}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt>Players</dt>
        <dd className="text-base font-black text-white">{players}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt>Queue</dt>
        <dd className="text-base font-black text-amber-300">{queued}</dd>
      </div>
      {requests > 0 ? (
        <div className="self-center rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-navy">
          <dt className="sr-only">Requests</dt>
          <dd>{requests} {requests === 1 ? "request" : "requests"}</dd>
        </div>
      ) : null}
    </dl>
  );
}
