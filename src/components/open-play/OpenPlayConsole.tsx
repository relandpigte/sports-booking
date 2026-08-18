"use client";

import { useActionState, useMemo, useState } from "react";

import { OpenPlayBoard } from "@/components/open-play/OpenPlayBoard";
import { OpenPlayLiveRefresh } from "@/components/open-play/OpenPlayLiveRefresh";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  addOpenPlayWalkInAction,
  approvePublicQueueGuestAction,
  bulkCheckInOpenPlayParticipantsAction,
  changeOpenPlayModeAction,
  changeQueueAdmissionModeAction,
  checkInOpenPlayParticipantAction,
  checkOutOpenPlayParticipantAction,
  editOpenPlayParticipantAction,
  editStagedOpenPlayMatchAction,
  endOpenPlaySessionAction,
  pairOpenPlayParticipantsAction,
  pauseOpenPlayParticipantAction,
  prepareOpenPlayAction,
  recordOpenPlayWinnerAction,
  rejectPublicQueueGuestAction,
  removeOpenPlayParticipantAction,
  resumeOpenPlayParticipantAction,
  stageOpenPlayMatchAction,
  startNewOpenPlayRunAction,
  startOpenPlayMatchAction,
  startOpenPlaySessionAction,
  syncOpenPlayRosterAction,
  toggleOpenPlayCourtAction,
  undoOpenPlayResultAction,
  unpairOpenPlayParticipantsAction,
} from "@/lib/open-play-actions";
import {
  OPEN_PLAY_MODE_DESCRIPTIONS,
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

function Feedback({ state }: { state: OpenPlayActionState }) {
  if (!state.message && !state.success) return null;
  return (
    <p
      role="status"
      className={`mt-2 text-xs font-bold ${
        state.success ? "text-emerald-700" : "text-red-600"
      }`}
    >
      {state.success ?? state.message}
    </p>
  );
}

function ActionForm({
  action,
  values,
  label,
  className = "",
  tone = "default",
  confirm,
}: {
  action: Action;
  values: Record<string, string | number | boolean>;
  label: string;
  className?: string;
  tone?: "default" | "danger" | "quiet";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      <button
        disabled={pending}
        className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-black transition disabled:opacity-50 ${
          tone === "danger"
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : tone === "quiet"
              ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              : "bg-primary text-white hover:bg-primary-hover"
        }`}
      >
        {pending ? "Working…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PrepareOpenPlay({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(prepareOpenPlayAction, {});
  return (
    <form action={action} className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <input type="hidden" name="publicId" value={publicId} />
      <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">BunalQ</p>
      <h2 className="mt-2 text-xl font-black text-navy">Prepare live court rotation</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
        Import confirmed players and prepare the Event courts. Registrations and payments stay unchanged.
      </p>
      <Button className="mx-auto mt-5 max-w-xs" disabled={pending}>
        {pending ? "Preparing…" : "Prepare BunalQ"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

function ModeForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(changeOpenPlayModeAction, {});
  const [selected, setSelected] = useState(snapshot.matchingMode);
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Matching mode</h2>
          <p className="mt-1 text-xs text-slate-500">Changes apply to the next staged match.</p>
        </div>
        <button disabled={pending || selected === snapshot.matchingMode} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black text-white disabled:opacity-40">
          {pending ? "Saving…" : "Apply mode"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {OPEN_PLAY_MODES.map((mode) => (
          <label
            key={mode}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              selected === mode
                ? "border-primary bg-primary-soft ring-1 ring-primary"
                : "border-slate-200 hover:border-primary/40"
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={mode}
              checked={selected === mode}
              onChange={() => setSelected(mode)}
              className="sr-only"
            />
            <span className="text-sm font-black text-navy">{OPEN_PLAY_MODE_LABELS[mode]}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{OPEN_PLAY_MODE_DESCRIPTIONS[mode]}</span>
          </label>
        ))}
      </div>
      <Feedback state={state} />
    </form>
  );
}

function WalkInForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(addOpenPlayWalkInAction, {});
  return (
    <form action={action} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_150px_auto] sm:items-end">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <input type="hidden" name="publicId" value={snapshot.queue.publicId} />
      <label className="text-xs font-bold text-slate-600">
        Add player
        <input name="displayName" maxLength={120} required placeholder="Player name" className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-navy" />
      </label>
      <Select name="skillLevel" label="Skill" options={[...SKILL_LEVELS]} defaultValue="intermediate" />
      <Button className="min-h-10 py-2" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
      <div className="sm:col-span-3"><Feedback state={state} /></div>
    </form>
  );
}

function AdmissionForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(changeQueueAdmissionModeAction, {});
  if (snapshot.queue.kind !== "QUICK") return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-2xl border border-ocean/20 bg-ocean-soft p-4">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <Select
        name="admissionMode"
        label="Public guest entry"
        defaultValue={snapshot.queue.admissionMode}
        options={[
          { value: "APPROVAL_REQUIRED", label: "Organizer approval" },
          { value: "INSTANT", label: "Instant queue entry" },
        ]}
      />
      <Button className="w-auto min-h-10 py-2" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      <div className="w-full"><Feedback state={state} /></div>
    </form>
  );
}

function PairForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useActionState(pairOpenPlayParticipantsAction, {});
  const eligible = snapshot.participants.filter((participant) =>
    ["NOT_CHECKED_IN", "QUEUED", "PAUSED", "CHECKED_OUT"].includes(participant.status)
  );
  if (snapshot.matchingMode !== "FIXED_PARTNERS") return null;
  const options = eligible.map((participant) => ({ value: participant.id, label: participant.displayName }));
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <Select name="firstId" label="Partner one" options={options} />
      <Select name="secondId" label="Partner two" options={options} />
      <Button className="w-auto min-h-10 py-2" disabled={pending || options.length < 2}>{pending ? "Pairing…" : "Save pair"}</Button>
      <div className="w-full"><Feedback state={state} /></div>
    </form>
  );
}

function StagedMatchEditor({ snapshot, game }: { snapshot: OpenPlaySnapshot; game: OpenPlaySnapshot["games"][number] }) {
  const [state, action, pending] = useActionState(editStagedOpenPlayMatchAction, {});
  const currentIds = new Set(game.players.map((player) => player.participantId));
  const options = snapshot.participants
    .filter((participant) => participant.status === "QUEUED" || (participant.status === "STAGED" && currentIds.has(participant.id)))
    .map((participant) => ({ value: participant.id, label: participant.displayName }));
  const players = [...game.players].sort((left, right) => left.slot - right.slot);
  return (
    <details className="mt-2 rounded-lg bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-black text-navy">Edit teams</summary>
      <form action={action} className="mt-2 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="sessionId" value={snapshot.id} />
        <input type="hidden" name="gameId" value={game.id} />
        {[0, 1, 2, 3].map((index) => (
          <Select key={index} name={`player${index + 1}`} label={`${index < 2 ? "Team 1" : "Team 2"} · P${(index % 2) + 1}`} options={options} defaultValue={players[index]?.participantId} />
        ))}
        <Button className="sm:col-span-2 min-h-10 py-2" disabled={pending}>{pending ? "Saving…" : "Save teams"}</Button>
        <div className="sm:col-span-2"><Feedback state={state} /></div>
      </form>
    </details>
  );
}

function MatchControls({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const games = snapshot.games.filter((game) => game.status === "STAGED" || game.status === "ACTIVE");
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Court status</h2>
        {snapshot.games.find((game) => game.status === "COMPLETED") ? (() => {
          const latest = snapshot.games.find((game) => game.status === "COMPLETED");
          return latest ? <ActionForm action={undoOpenPlayResultAction} values={{ sessionId: snapshot.id, gameId: latest.id }} label="Undo latest result" tone="quiet" /> : null;
        })() : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.courts.map((court) => {
          const game = games.find((item) => item.courtId === court.id);
          return (
            <article key={court.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <h3 className="text-sm font-black text-navy">{court.name}</h3>
                <span className={`text-[10px] font-black uppercase tracking-wider ${game?.status === "ACTIVE" ? "text-primary" : game ? "text-ocean" : "text-slate-500"}`}>
                  {!court.active ? "Paused" : game?.status === "ACTIVE" ? "Playing" : game ? "Staged" : "Ready"}
                </span>
              </div>
              <div className="p-3">
                {game ? (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    {[1, 2].map((team, index) => (
                      <div key={team} className="contents">
                        {index === 1 ? <span className="text-[10px] font-black text-slate-300">VS</span> : null}
                        <div className="rounded-lg border border-slate-200 p-2 text-center">
                          {game.players.filter((player) => player.team === team).map((player) => <p key={player.participantId} className="truncate text-xs font-bold text-navy">{player.displayName}</p>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-4 text-center text-xs text-slate-500">Ready for the next match.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!game ? <ActionForm action={toggleOpenPlayCourtAction} values={{ sessionId: snapshot.id, courtId: court.id, active: !court.active }} label={court.active ? "Pause court" : "Resume court"} tone="quiet" /> : null}
                  {!game && court.active && snapshot.status === "ACTIVE" ? <ActionForm action={stageOpenPlayMatchAction} values={{ sessionId: snapshot.id, courtId: court.id }} label="Stage next" /> : null}
                  {game?.status === "STAGED" ? <ActionForm action={startOpenPlayMatchAction} values={{ sessionId: snapshot.id, gameId: game.id }} label="Start match" /> : null}
                  {game?.status === "ACTIVE" ? <>
                    <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 1 }} label="Team 1 won" />
                    <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 2 }} label="Team 2 won" />
                  </> : null}
                </div>
                {game?.status === "STAGED" ? <StagedMatchEditor snapshot={snapshot} game={game} /> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const GROUPS = [
  ["PENDING_APPROVAL", "Pending approval"],
  ["QUEUED", "Waiting"],
  ["PLAYING", "Playing"],
  ["STAGED", "Staged"],
  ["PAUSED", "On break"],
  ["NOT_CHECKED_IN", "Not checked in"],
  ["CHECKED_OUT", "Checked out"],
  ["REMOVED", "Removed"],
] as const;

type Participant = OpenPlaySnapshot["participants"][number];
type ParticipantStatus = Participant["status"];
type RosterFilter = "ACTIVE" | ParticipantStatus;

const STATUS_STYLES: Record<ParticipantStatus, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  QUEUED: "bg-emerald-100 text-emerald-800",
  PLAYING: "bg-sky-100 text-sky-800",
  STAGED: "bg-indigo-100 text-indigo-800",
  PAUSED: "bg-orange-100 text-orange-800",
  NOT_CHECKED_IN: "bg-slate-100 text-slate-700",
  CHECKED_OUT: "bg-slate-100 text-slate-600",
  REMOVED: "bg-red-50 text-red-700",
};

function ParticipantPrimaryAction({
  snapshot,
  participant,
}: {
  snapshot: OpenPlaySnapshot;
  participant: Participant;
}) {
  const values = { sessionId: snapshot.id, participantId: participant.id };
  if (participant.status === "PENDING_APPROVAL") {
    return <ActionForm action={approvePublicQueueGuestAction} values={values} label="Approve + check in" />;
  }
  if (["NOT_CHECKED_IN", "CHECKED_OUT"].includes(participant.status)) {
    return <ActionForm action={checkInOpenPlayParticipantAction} values={values} label="Check in" />;
  }
  if (participant.status === "QUEUED") {
    return <ActionForm action={pauseOpenPlayParticipantAction} values={values} label="Break" tone="quiet" />;
  }
  if (participant.status === "PAUSED") {
    return <ActionForm action={resumeOpenPlayParticipantAction} values={values} label="Rejoin" />;
  }
  return null;
}

function ParticipantMoreActions({
  snapshot,
  participant,
}: {
  snapshot: OpenPlaySnapshot;
  participant: Participant;
}) {
  const values = { sessionId: snapshot.id, participantId: participant.id };
  const canCheckOut = ["NOT_CHECKED_IN", "QUEUED", "PAUSED"].includes(participant.status);
  const canRemove = !["STAGED", "PLAYING", "REMOVED", "PENDING_APPROVAL"].includes(participant.status);
  const canEdit = !["REMOVED", "PENDING_APPROVAL"].includes(participant.status);
  const hasActions = participant.status === "PENDING_APPROVAL" || canCheckOut || canRemove || canEdit;

  if (!hasActions) return null;
  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        More
      </summary>
      <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg xl:absolute xl:right-0 xl:z-20 xl:w-80">
        {participant.status === "PENDING_APPROVAL" ? (
          <ActionForm action={rejectPublicQueueGuestAction} values={values} label="Reject request" tone="danger" />
        ) : null}
        {canCheckOut ? (
          <ActionForm action={checkOutOpenPlayParticipantAction} values={values} label="Check out" tone="quiet" />
        ) : null}
        {canRemove ? (
          <ActionForm
            action={removeOpenPlayParticipantAction}
            values={values}
            label="Remove"
            tone="danger"
            confirm={`Remove ${participant.displayName} from this run?`}
          />
        ) : null}
        {canEdit ? <EditParticipantForm snapshot={snapshot} participant={participant} /> : null}
      </div>
    </details>
  );
}

function ParticipantRoster({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RosterFilter>("ACTIVE");
  const [bulkState, bulkAction, bulkPending] = useActionState(bulkCheckInOpenPlayParticipantsAction, {});
  const activeCount = snapshot.participants.filter((player) => player.status !== "REMOVED").length;
  const sortedParticipants = useMemo(
    () => GROUPS.flatMap(([status]) => snapshot.participants.filter((player) => player.status === status)),
    [snapshot.participants]
  );
  const visibleParticipants = filter === "ACTIVE"
    ? sortedParticipants.filter((player) => player.status !== "REMOVED")
    : sortedParticipants.filter((player) => player.status === filter);
  const eligible = visibleParticipants.filter((player) =>
    ["NOT_CHECKED_IN", "CHECKED_OUT"].includes(player.status)
  );
  const filters: Array<{ value: RosterFilter; label: string; count: number }> = [
    { value: "ACTIVE", label: "Active", count: activeCount },
    ...GROUPS.flatMap(([status, label]) => {
      const count = snapshot.participants.filter((player) => player.status === status).length;
      return count > 0 ? [{ value: status, label, count }] : [];
    }),
  ];
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectVisibleEligible = (checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    eligible.forEach((player) => {
      if (checked) next.add(player.id);
      else next.delete(player.id);
    });
    return next;
  });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Active roster</h2>
          <p className="mt-1 text-xs text-slate-500">{activeCount} active records · Updates live</p>
        </div>
        {snapshot.queue.kind === "EVENT" ? <ActionForm action={syncOpenPlayRosterAction} values={{ sessionId: snapshot.id }} label="Refresh" tone="quiet" /> : null}
      </div>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter roster">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              aria-pressed={filter === item.value}
              className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-black transition ${
                filter === item.value
                  ? "bg-navy text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label} <span className={filter === item.value ? "text-white/70" : "text-slate-400"}>{item.count}</span>
            </button>
          ))}
        </div>
      </div>
      {eligible.length > 0 ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 sm:px-5">
          <input
            type="checkbox"
            checked={eligible.every((player) => selected.has(player.id))}
            onChange={(event) => selectVisibleEligible(event.target.checked)}
          />
          Select all eligible in this view
        </label>
      ) : null}
      <div className="hidden grid-cols-[36px_minmax(180px,1.4fr)_110px_120px_72px_minmax(180px,auto)] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 xl:grid">
        <span />
        <span>Player</span>
        <span>Skill</span>
        <span>Status</span>
        <span>Wait</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-slate-100">
        {visibleParticipants.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No players in this view.</p>
        ) : visibleParticipants.map((player) => {
          const groupLabel = GROUPS.find(([status]) => status === player.status)?.[1] ?? player.status;
          const isEligible = ["NOT_CHECKED_IN", "CHECKED_OUT"].includes(player.status);
          const queueNumber = player.queuePosition
            ? snapshot.participants.filter(
                (item) => item.status === "QUEUED" && (item.queuePosition ?? 0) <= player.queuePosition!
              ).length
            : null;
          return (
            <article
              key={player.id}
              className={`relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-3 transition sm:px-5 xl:grid-cols-[36px_minmax(180px,1.4fr)_110px_120px_72px_minmax(180px,auto)] xl:items-center ${
                player.status === "PENDING_APPROVAL" ? "bg-amber-50/70" : "hover:bg-slate-50/70"
              }`}
            >
              <div className="flex h-9 items-center justify-center">
                {isEligible ? (
                  <input
                    type="checkbox"
                    checked={selected.has(player.id)}
                    onChange={() => toggle(player.id)}
                    aria-label={`Select ${player.displayName}`}
                  />
                ) : (
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${
                    queueNumber ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-500"
                  }`}>
                    {queueNumber ?? player.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 self-center">
                <p className="truncate text-sm font-black text-navy">{player.displayName}</p>
                <p className="mt-0.5 truncate text-[11px] capitalize text-slate-500">
                  {player.source.toLowerCase().replaceAll("_", " ")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 xl:hidden">
                  <span className="text-xs capitalize text-slate-600">{player.skillLevel}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${STATUS_STYLES[player.status]}`}>{groupLabel}</span>
                  {player.estimatedWaitMinutes ? <span className="text-xs text-slate-500">~{player.estimatedWaitMinutes}m</span> : null}
                </div>
              </div>
              <p className="hidden text-xs capitalize text-slate-600 xl:block">{player.skillLevel}</p>
              <div className="hidden xl:block">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${STATUS_STYLES[player.status]}`}>{groupLabel}</span>
              </div>
              <p className="hidden text-xs text-slate-500 xl:block">{player.estimatedWaitMinutes ? `~${player.estimatedWaitMinutes}m` : "—"}</p>
              <div className="col-span-2 flex flex-wrap justify-end gap-2 xl:col-span-1 xl:flex-nowrap">
                <ParticipantPrimaryAction snapshot={snapshot} participant={player} />
                <ParticipantMoreActions snapshot={snapshot} participant={player} />
              </div>
            </article>
          );
        })}
      </div>
      {selected.size > 0 ? (
        <form action={bulkAction} className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-2xl bg-navy p-3 text-white sm:px-5">
          <input type="hidden" name="sessionId" value={snapshot.id} />
          {[...selected].map((id) => <input key={id} type="hidden" name="participantId" value={id} />)}
          <div><p className="text-xs font-black">{selected.size} selected</p><Feedback state={bulkState} /></div>
          <button disabled={bulkPending} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black">{bulkPending ? "Checking in…" : "Bulk check in"}</button>
        </form>
      ) : null}
    </section>
  );
}

function EditParticipantForm({ snapshot, participant }: { snapshot: OpenPlaySnapshot; participant: OpenPlaySnapshot["participants"][number] }) {
  const [state, action, pending] = useActionState(editOpenPlayParticipantAction, {});
  return (
    <form action={action} className="mt-2 grid gap-2 rounded-lg bg-white p-2 sm:grid-cols-2">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <input type="hidden" name="participantId" value={participant.id} />
      <label className="text-[10px] font-bold text-slate-500">Name<input name="displayName" defaultValue={participant.displayName} required className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-xs" /></label>
      <Select name="skillLevel" label="Skill" options={[...SKILL_LEVELS]} defaultValue={participant.skillLevel} />
      <button disabled={pending} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black text-white sm:col-span-2">{pending ? "Saving…" : "Save changes"}</button>
      <div className="sm:col-span-2"><Feedback state={state} /></div>
    </form>
  );
}

export function OpenPlayConsole({ snapshot, canManage }: { snapshot: OpenPlaySnapshot; canManage: boolean }) {
  const waiting = snapshot.participants.filter((player) => player.status === "QUEUED").length;
  const pending = snapshot.participants.filter((player) => player.status === "PENDING_APPROVAL").length;
  const playing = snapshot.participants.filter((player) => player.status === "PLAYING").length;
  const activeCourts = snapshot.courts.filter((court) => court.active).length;
  const pairs = new Map<string, string[]>();
  snapshot.participants.forEach((player) => { if (player.pairId) pairs.set(player.pairId, [...(pairs.get(player.pairId) ?? []), player.displayName]); });
  return (
    <div className="space-y-5">
      <OpenPlayLiveRefresh publicId={snapshot.queue.publicId} />
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Pending", pending], ["Waiting", waiting], ["Playing", playing], ["Active courts", `${activeCourts}/${snapshot.courts.length}`]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-navy">{value}</p></div>
        ))}
      </section>
      {canManage ? <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div><p className="text-sm font-black text-navy">Run {snapshot.runNumber}</p><p className="text-xs text-slate-500">{snapshot.status.toLowerCase()} · {OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]}</p></div>
          <div className="flex flex-wrap gap-2">
            {snapshot.status === "SETUP" ? <ActionForm action={startOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="Start run" /> : null}
            {snapshot.status !== "ENDED" ? <ActionForm action={endOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="End run" tone="danger" confirm="End this run? Staged and active matches will be cancelled." /> : null}
            {snapshot.status === "ENDED" ? <ActionForm action={startNewOpenPlayRunAction} values={{ sessionId: snapshot.id }} label="Start new run" confirm="Create a fresh run and reset copied players to not checked in?" /> : null}
          </div>
        </div>
        <ModeForm snapshot={snapshot} />
        <AdmissionForm snapshot={snapshot} />
        <PairForm snapshot={snapshot} />
        {pairs.size > 0 ? <div className="flex flex-wrap gap-2">{[...pairs.entries()].map(([pairId, names]) => <div key={pairId} className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"><span>{names.join(" + ")}</span><ActionForm action={unpairOpenPlayParticipantsAction} values={{ sessionId: snapshot.id, pairId }} label="Unpair" tone="quiet" /></div>)}</div> : null}
        <WalkInForm snapshot={snapshot} />
        <div className="space-y-5">
          <div>{snapshot.status === "ACTIVE" ? <MatchControls snapshot={snapshot} /> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Start the run to stage matches.</p>}</div>
          <ParticipantRoster snapshot={snapshot} />
        </div>
      </> : null}
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-black text-navy">Player board preview</summary>
        <div className="mt-5"><OpenPlayBoard snapshot={snapshot} /></div>
      </details>
    </div>
  );
}
