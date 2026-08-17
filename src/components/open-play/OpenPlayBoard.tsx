import {
  OPEN_PLAY_MODE_LABELS,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";

function Team({
  players,
  winner,
}: {
  players: { displayName: string }[];
  winner: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        winner
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-navy"
      }`}
    >
      {players.map((player) => (
        <p key={player.displayName} className="truncate text-sm font-bold">
          {player.displayName}
        </p>
      ))}
    </div>
  );
}

export function OpenPlayBoard({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const liveGames = snapshot.games
    .filter((game) => game.status === "ACTIVE" || game.status === "STAGED")
    .sort((left, right) => left.sequence - right.sequence);
  const queued = snapshot.participants
    .filter((participant) => participant.status === "QUEUED")
    .sort(
      (left, right) =>
        (left.queuePosition ?? Number.MAX_SAFE_INTEGER) -
        (right.queuePosition ?? Number.MAX_SAFE_INTEGER)
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-primary">
          {OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {snapshot.status}
        </span>
        <span className="text-xs text-slate-500">
          Average game: {snapshot.averageGameMinutes} min
        </span>
      </div>

      <section>
        <h2 className="text-lg font-black text-navy">Courts</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.courts.map((court) => {
            const game = liveGames.find((item) => item.courtId === court.id);
            return (
              <article
                key={court.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  court.active
                    ? "border-slate-200 bg-white"
                    : "border-slate-200 bg-slate-100 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-navy">{court.name}</h3>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    {!court.active
                      ? "Paused"
                      : game?.status === "ACTIVE"
                        ? "Playing"
                        : game?.status === "STAGED"
                          ? "Up Next"
                          : "Open"}
                  </span>
                </div>
                {game ? (
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Team
                      players={game.players.filter((player) => player.team === 1)}
                      winner={game.winningTeam === 1}
                    />
                    <span className="text-xs font-black text-slate-400">VS</span>
                    <Team
                      players={game.players.filter((player) => player.team === 2)}
                      winner={game.winningTeam === 2}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    {court.active ? "Ready for the next match." : "Court rotation is paused."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-black text-navy">Waiting queue</h2>
            <span className="text-xs font-bold text-slate-500">{queued.length} waiting</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {queued.length > 0 ? (
              <ol className="divide-y divide-slate-100">
                {queued.map((participant, index) => (
                  <li key={participant.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-black text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-navy">{participant.displayName}</p>
                      <p className="text-xs capitalize text-slate-500">{participant.skillLevel}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      ~{participant.estimatedWaitMinutes ?? 0} min
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                Nobody is waiting right now.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black text-navy">Standings</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {snapshot.standings.length > 0 ? (
              <ol className="divide-y divide-slate-100">
                {snapshot.standings.map((row, index) => (
                  <li key={row.participantId} className="grid grid-cols-[32px_1fr_auto] items-center gap-2 px-4 py-3">
                    <span className="font-black text-slate-400">{index + 1}</span>
                    <span className="truncate text-sm font-bold text-navy">{row.displayName}</span>
                    <span className="text-xs font-bold text-slate-600">{row.wins}W · {row.losses}L</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                Results will appear after the first game.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
