import {
  OPEN_PLAY_MODE_DESCRIPTIONS,
  OPEN_PLAY_MODE_LABELS,
  OPEN_PLAY_UP_NEXT_BUFFER_SIZE,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";
import { liveMatchPalette } from "@/components/open-play/openPlayColors";

function Team({
  players,
  label,
  panelClassName,
  accentClassName,
}: {
  players: { participantId: string; displayName: string }[];
  label?: string;
  panelClassName?: string;
  accentClassName?: string;
}) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border ${panelClassName ?? "border-slate-200 bg-slate-50"}`}>
      {label ? <p className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${accentClassName}`}>{label}</p> : null}
      <div className="space-y-1 px-3 py-2 text-center">
        {players.map((player) => (
          <p key={player.participantId} className="truncate text-sm font-black text-navy">{player.displayName}</p>
        ))}
      </div>
    </div>
  );
}

export function OpenPlayBoard({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const courtGames = snapshot.games
    .filter(
      (game) =>
        game.courtId && ["STAGED", "ACTIVE"].includes(game.status)
    )
    .sort((left, right) => left.sequence - right.sequence);
  const upNext = snapshot.games
    .filter((game) => game.status === "STAGED" && !game.courtId)
    .sort((left, right) => left.sequence - right.sequence);
  const queued = snapshot.participants
    .filter((participant) => participant.status === "QUEUED")
    .sort((left, right) => (left.queuePosition ?? Number.MAX_SAFE_INTEGER) - (right.queuePosition ?? Number.MAX_SAFE_INTEGER));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">{OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${snapshot.status === "ACTIVE" ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{snapshot.status}</span>
            <span className="text-xs font-bold text-slate-400">Run {snapshot.runNumber}</span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{OPEN_PLAY_MODE_DESCRIPTIONS[snapshot.matchingMode]}</p>
        </div>
        <p className="text-xs font-bold text-slate-500">Average game: {snapshot.averageGameMinutes} min</p>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-navy">Courts</h2>
          <span className="text-xs font-bold text-slate-500">{snapshot.courts.filter((court) => court.active).length} active</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.courts.map((court) => {
            const game = courtGames.find((item) => item.courtId === court.id);
            const live = game?.status === "ACTIVE";
            const staged = game?.status === "STAGED";
            const palette = game ? liveMatchPalette(game.id) : null;
            return (
              <article key={court.id} className={`overflow-hidden rounded-2xl border bg-white ${live ? "border-emerald-200" : staged ? "border-violet-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                  <h3 className="font-black text-navy">{court.name}</h3>
                  <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${live ? "text-emerald-700" : staged ? "text-violet-700" : "text-slate-400"}`}>
                    {!court.active ? "Paused" : live ? "Playing" : staged ? "Up next" : "Open"}
                  </span>
                </div>
                <div className="p-4">
                  {game && palette ? (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <Team label="Team 1" panelClassName={palette.team1Panel} accentClassName={palette.team1Accent} players={game.players.filter((player) => player.team === 1)} />
                      <span className="text-[10px] font-black text-slate-400">VS</span>
                      <Team label="Team 2" panelClassName={palette.team2Panel} accentClassName={palette.team2Accent} players={game.players.filter((player) => player.team === 2)} />
                    </div>
                  ) : <p className="py-5 text-center text-sm text-slate-500">{court.active ? "Ready for the next match." : "Court rotation is paused."}</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-navy">Up next</h2>
            <p className="mt-1 text-xs text-slate-500">Be ready when a court opens.</p>
          </div>
          <span className="text-xs font-bold text-slate-500">{upNext.length}/{OPEN_PLAY_UP_NEXT_BUFFER_SIZE} prepared</span>
        </div>
        {upNext.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upNext.map((game, index) => (
              <article key={game.id} className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm ring-1 ring-violet-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-violet-700">Match {index + 1}</p>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-700">{OPEN_PLAY_MODE_LABELS[game.matchingMode]}</span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Team players={game.players.filter((player) => player.team === 1)} />
                  <span className="text-[10px] font-black text-slate-300">VS</span>
                  <Team players={game.players.filter((player) => player.team === 2)} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Up to two matchups appear automatically as eligible players become available.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-navy">Waiting queue</h2>
            <span className="text-xs font-bold text-slate-500">{queued.length} waiting</span>
          </div>
          {queued.length > 0 ? (
            <ol className="grid sm:grid-cols-2">
              {queued.map((participant, index) => (
                <li key={participant.id} className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-2.5 sm:odd:border-r">
                  <span className="text-lg font-black text-slate-200">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy">{participant.displayName}</p>
                    <p className="text-[10px] capitalize text-slate-500">{participant.skillLevel}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">~{participant.estimatedWaitMinutes ?? 0}m</span>
                </li>
              ))}
            </ol>
          ) : <p className="px-4 py-10 text-center text-sm text-slate-500">Nobody is waiting right now.</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-black uppercase tracking-[0.16em] text-navy">Standings</h2></div>
          {snapshot.standings.length > 0 ? (
            <ol>
              {snapshot.standings.map((row, index) => (
                <li key={row.participantId} className={`grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-slate-100 px-4 py-2.5 ${index === 0 ? "bg-primary-soft" : ""}`}>
                  <span className={`text-xs font-black ${index === 0 ? "text-primary" : "text-slate-400"}`}>{index + 1}</span>
                  <span className="truncate text-sm font-bold text-navy">{row.displayName}</span>
                  <span className="text-xs font-black text-slate-600">{row.wins}W · {row.losses}L</span>
                </li>
              ))}
            </ol>
          ) : <p className="px-4 py-10 text-center text-sm text-slate-500">Results appear after the first game.</p>}
        </section>
      </div>
    </div>
  );
}
