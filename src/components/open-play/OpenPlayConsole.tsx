"use client";

import { useActionState } from "react";
import { OpenPlayBoard } from "@/components/open-play/OpenPlayBoard";
import { OpenPlayLiveRefresh } from "@/components/open-play/OpenPlayLiveRefresh";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  addOpenPlayWalkInAction,
  changeOpenPlayModeAction,
  checkInOpenPlayParticipantAction,
  checkOutOpenPlayParticipantAction,
  endOpenPlaySessionAction,
  editStagedOpenPlayMatchAction,
  pairOpenPlayParticipantsAction,
  pauseOpenPlayParticipantAction,
  prepareOpenPlayAction,
  recordOpenPlayWinnerAction,
  resumeOpenPlayParticipantAction,
  stageOpenPlayMatchAction,
  startOpenPlayMatchAction,
  startOpenPlaySessionAction,
  syncOpenPlayRosterAction,
  toggleOpenPlayCourtAction,
  undoOpenPlayResultAction,
  unpairOpenPlayParticipantsAction,
} from "@/lib/open-play-actions";
import {
  OPEN_PLAY_MODE_LABELS,
  OPEN_PLAY_MODES,
  type OpenPlayActionState,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";
import { SKILL_LEVELS } from "@/lib/constants";

type Action = (
  previous: OpenPlayActionState,
  formData: FormData
) => Promise<OpenPlayActionState>;

function ActionForm({
  action,
  values,
  label,
  className = "",
  tone = "default",
}: {
  action: Action;
  values: Record<string, string | number | boolean>;
  label: string;
  className?: string;
  tone?: "default" | "danger" | "quiet";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      <button
        disabled={pending}
        title={state.message ?? state.success}
        className={`min-h-10 rounded-xl px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
          tone === "danger"
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : tone === "quiet"
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-primary text-white hover:brightness-95"
        }`}
      >
        {pending ? "Working…" : label}
      </button>
    </form>
  );
}

export function PrepareOpenPlay({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(prepareOpenPlayAction, {});
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-6">
      <input type="hidden" name="publicId" value={publicId} />
      <h2 className="text-lg font-black text-navy">Prepare live queue</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This creates the court rotation and imports confirmed players. It does not change registrations or payments.
      </p>
      <Button className="mt-4" disabled={pending}>{pending ? "Preparing…" : "Prepare Open Play"}</Button>
      {state.message || state.success ? (
        <p className={`mt-3 text-sm font-bold ${state.success ? "text-emerald-700" : "text-red-600"}`}>
          {state.success ?? state.message}
        </p>
      ) : null}
    </form>
  );
}

function WalkInForm({ sessionId, publicId }: { sessionId: string; publicId: string }) {
  const [state, action, pending] = useActionState(addOpenPlayWalkInAction, {});
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="publicId" value={publicId} />
      <label className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
        Walk-in name
        <input name="displayName" maxLength={120} required className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold text-navy" />
      </label>
      <Select name="skillLevel" label="Skill level" options={[...SKILL_LEVELS]} defaultValue="intermediate" />
      <Button disabled={pending}>{pending ? "Adding…" : "Add walk-in"}</Button>
      {state.message || state.success ? (
        <p className={`text-xs font-bold sm:col-span-3 ${state.success ? "text-emerald-700" : "text-red-600"}`}>
          {state.success ?? state.message}
        </p>
      ) : null}
    </form>
  );
}

function ModeForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(changeOpenPlayModeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <Select
        name="mode"
        label="Matching mode"
        defaultValue={snapshot.matchingMode}
        options={OPEN_PLAY_MODES.map((mode) => ({ value: mode, label: OPEN_PLAY_MODE_LABELS[mode] }))}
      />
      <Button disabled={pending}>{pending ? "Saving…" : "Apply mode"}</Button>
      {state.message ? <span className="text-xs font-bold text-red-600">{state.message}</span> : null}
    </form>
  );
}

function PairForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(pairOpenPlayParticipantsAction, {});
  const eligible = snapshot.participants.filter((participant) =>
    ["NOT_CHECKED_IN", "QUEUED", "PAUSED", "CHECKED_OUT"].includes(participant.status)
  );
  const options = eligible.map((participant) => ({ value: participant.id, label: participant.displayName }));
  if (snapshot.matchingMode !== "FIXED_PARTNERS") return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <Select name="firstId" label="First partner" options={options} />
      <Select name="secondId" label="Second partner" options={options} />
      <Button disabled={pending || options.length < 2}>{pending ? "Pairing…" : "Save pair"}</Button>
      {state.message ? <span className="text-xs font-bold text-red-600">{state.message}</span> : null}
    </form>
  );
}

function ParticipantControls({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const pairs = new Map<string, string[]>();
  for (const participant of snapshot.participants) {
    if (!participant.pairId) continue;
    pairs.set(participant.pairId, [...(pairs.get(participant.pairId) ?? []), participant.displayName]);
  }
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-navy">Players</h2>
        <ActionForm action={syncOpenPlayRosterAction} values={{ sessionId: snapshot.id }} label="Refresh registrations" tone="quiet" />
      </div>
      {pairs.size > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[...pairs.entries()].map(([pairId, names]) => (
            <div key={pairId} className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
              <span>{names.join(" + ")}</span>
              <ActionForm action={unpairOpenPlayParticipantsAction} values={{ sessionId: snapshot.id, pairId }} label="Unpair" tone="quiet" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.participants.map((participant) => (
          <article key={participant.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black text-navy">{participant.displayName}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{participant.skillLevel} · {participant.status.toLowerCase().replaceAll("_", " ")}</p>
              </div>
              {participant.pairId ? <span className="text-lg" title="Fixed pair">🔗</span> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["NOT_CHECKED_IN", "CHECKED_OUT"].includes(participant.status) ? (
                <ActionForm action={checkInOpenPlayParticipantAction} values={{ sessionId: snapshot.id, participantId: participant.id }} label="Check in" />
              ) : null}
              {participant.status === "QUEUED" ? (
                <ActionForm action={pauseOpenPlayParticipantAction} values={{ sessionId: snapshot.id, participantId: participant.id }} label="Take break" tone="quiet" />
              ) : null}
              {participant.status === "PAUSED" ? (
                <ActionForm action={resumeOpenPlayParticipantAction} values={{ sessionId: snapshot.id, participantId: participant.id }} label="Rejoin queue" />
              ) : null}
              {["NOT_CHECKED_IN", "QUEUED", "PAUSED"].includes(participant.status) ? (
                <ActionForm action={checkOutOpenPlayParticipantAction} values={{ sessionId: snapshot.id, participantId: participant.id }} label="Check out" tone="danger" />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MatchControls({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const games = snapshot.games.filter((game) => game.status === "STAGED" || game.status === "ACTIVE");
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="font-black text-navy">Court controls</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {snapshot.courts.map((court) => {
          const game = games.find((item) => item.courtId === court.id);
          return (
            <div key={court.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-black text-navy">{court.name}</p>
                {!game ? (
                  <ActionForm action={toggleOpenPlayCourtAction} values={{ sessionId: snapshot.id, courtId: court.id, active: !court.active }} label={court.active ? "Pause court" : "Resume court"} tone="quiet" />
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!game && court.active && snapshot.status === "ACTIVE" ? (
                  <ActionForm action={stageOpenPlayMatchAction} values={{ sessionId: snapshot.id, courtId: court.id }} label="Stage next" />
                ) : null}
                {game?.status === "STAGED" ? (
                  <>
                    <ActionForm action={startOpenPlayMatchAction} values={{ sessionId: snapshot.id, gameId: game.id }} label="Start match" />
                    <StagedMatchEditor snapshot={snapshot} game={game} />
                  </>
                ) : null}
                {game?.status === "ACTIVE" ? (
                  <>
                    <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 1 }} label="Team 1 won" />
                    <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 2 }} label="Team 2 won" />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {snapshot.games.find((game) => game.status === "COMPLETED") ? (
        <div className="mt-3">
          {(() => {
            const latest = snapshot.games.find((game) => game.status === "COMPLETED");
            return latest ? <ActionForm action={undoOpenPlayResultAction} values={{ sessionId: snapshot.id, gameId: latest.id }} label={`Undo latest result (${latest.courtName})`} tone="quiet" /> : null;
          })()}
        </div>
      ) : null}
    </section>
  );
}

function StagedMatchEditor({
  snapshot,
  game,
}: {
  snapshot: OpenPlaySnapshot;
  game: OpenPlaySnapshot["games"][number];
}) {
  const [state, action, pending] = useActionState(editStagedOpenPlayMatchAction, {});
  const currentIds = new Set(game.players.map((player) => player.participantId));
  const options = snapshot.participants
    .filter(
      (participant) =>
        participant.status === "QUEUED" ||
        (participant.status === "STAGED" && currentIds.has(participant.id))
    )
    .map((participant) => ({ value: participant.id, label: participant.displayName }));
  const players = [...game.players].sort((left, right) => left.slot - right.slot);
  return (
    <details className="w-full rounded-xl bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-black text-navy">Edit Up Next teams</summary>
      <form action={action} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="sessionId" value={snapshot.id} />
        <input type="hidden" name="gameId" value={game.id} />
        {[0, 1, 2, 3].map((index) => (
          <Select
            key={index}
            name={`player${index + 1}`}
            label={`${index < 2 ? "Team 1" : "Team 2"} · Player ${(index % 2) + 1}`}
            options={options}
            defaultValue={players[index]?.participantId}
          />
        ))}
        <Button className="sm:col-span-2" disabled={pending}>
          {pending ? "Saving…" : "Save team changes"}
        </Button>
        {state.message || state.success ? (
          <p className={`text-xs font-bold sm:col-span-2 ${state.success ? "text-emerald-700" : "text-red-600"}`}>
            {state.success ?? state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}

export function OpenPlayConsole({
  snapshot,
  canManage,
}: {
  snapshot: OpenPlaySnapshot;
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <OpenPlayLiveRefresh publicId={snapshot.event.publicId} />
      {canManage ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <ModeForm snapshot={snapshot} />
            <div className="flex gap-2">
              {snapshot.status === "SETUP" ? (
                <ActionForm action={startOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="Start session" />
              ) : null}
              {snapshot.status !== "ENDED" ? (
                <ActionForm action={endOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="End session" tone="danger" />
              ) : null}
            </div>
          </div>
          <PairForm snapshot={snapshot} />
          <WalkInForm sessionId={snapshot.id} publicId={snapshot.event.publicId} />
          {snapshot.status === "ACTIVE" ? <MatchControls snapshot={snapshot} /> : null}
          <ParticipantControls snapshot={snapshot} />
        </>
      ) : null}
      <OpenPlayBoard snapshot={snapshot} />
    </div>
  );
}
