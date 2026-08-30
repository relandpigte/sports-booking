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
  bulkPauseOpenPlayParticipantsAction,
  bulkRemoveOpenPlayParticipantsAction,
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
import {
  runBunalQActionSafely,
  useBunalQActionState,
  type BunalQAction,
} from "@/hooks/useBunalQActionState";

function Feedback({ state }: { state: OpenPlayActionState }) {
  if (!state.message && !state.success) return null;
  return (
    <div className="mt-2" role="status">
      <p
        className={`text-xs font-bold ${
          state.success ? "text-emerald-700" : "text-red-600"
        }`}
      >
        {state.success ?? state.message}
      </p>
      {state.reloadRequired ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 min-h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700"
        >
          Reload page
        </button>
      ) : null}
    </div>
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
  action: BunalQAction;
  values: Record<string, string | number | boolean>;
  label: string;
  className?: string;
  tone?: "default" | "danger" | "quiet";
  confirm?: string;
}) {
  const [state, formAction, pending] = useBunalQActionState(action);
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
  const [state, action, pending] = useBunalQActionState(prepareOpenPlayAction);
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
  const [state, action, pending] = useBunalQActionState(changeOpenPlayModeAction);
  const [selected, setSelected] = useState(snapshot.matchingMode);
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {OPEN_PLAY_MODES.map((mode, index) => (
          <label
            key={mode}
            className={`group cursor-pointer rounded-xl border p-3 transition ${
              selected === mode
                ? "border-primary bg-primary-soft shadow-sm ring-1 ring-primary"
                : "border-slate-200 bg-slate-50/60 hover:border-primary/40 hover:bg-white"
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
            <span className="flex items-start justify-between gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${selected === mode ? "bg-primary text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>0{index + 1}</span>
              <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${selected === mode ? "border-primary bg-primary ring-2 ring-primary/15" : "border-slate-300 bg-white"}`} />
            </span>
            <span className="mt-3 block text-sm font-black text-navy">{OPEN_PLAY_MODE_LABELS[mode]}</span>
            <span className="mt-1 block text-[11px] leading-5 text-slate-500">{OPEN_PLAY_MODE_DESCRIPTIONS[mode]}</span>
          </label>
        ))}
      </div>
      <Feedback state={state} />
    </form>
  );
}

function WalkInForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useBunalQActionState(addOpenPlayWalkInAction);
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <input type="hidden" name="publicId" value={snapshot.queue.publicId} />
      <div>
        <h2 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Add player</h2>
        <p className="mt-1 text-xs text-slate-500">Add a walk-in directly to this run.</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-600">
          Player name
          <input name="displayName" maxLength={120} required placeholder="Enter player name" className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-navy" />
        </label>
        <Select name="skillLevel" label="Skill" options={[...SKILL_LEVELS]} defaultValue="intermediate" />
        <Button className="min-h-10 px-5 py-2.5 sm:w-auto" disabled={pending}>{pending ? "Adding…" : "Add player"}</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function AdmissionForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useBunalQActionState(changeQueueAdmissionModeAction);
  if (snapshot.queue.kind !== "QUICK") return null;
  return (
    <form action={action} className="rounded-2xl border border-ocean/20 bg-ocean-soft p-4 sm:p-5">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <div>
        <h2 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Guest entry</h2>
        <p className="mt-1 text-xs text-slate-500">Choose how public requests enter the queue.</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Select
          name="admissionMode"
          label="Admission mode"
          defaultValue={snapshot.queue.admissionMode}
          options={[
            { value: "APPROVAL_REQUIRED", label: "Organizer approval" },
            { value: "INSTANT", label: "Instant queue entry" },
          ]}
        />
        <Button className="min-h-10 px-5 py-2.5 sm:w-auto" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function PairForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useBunalQActionState(pairOpenPlayParticipantsAction);
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
  const [state, action, pending] = useBunalQActionState(editStagedOpenPlayMatchAction);
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {snapshot.courts.map((court) => {
          const game = games.find((item) => item.courtId === court.id);
          return (
            <article key={court.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${game?.status === "ACTIVE" ? "border-primary/40 ring-1 ring-primary/10" : "border-slate-200"}`}>
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                <h3 className="text-sm font-black text-navy">{court.name}</h3>
                <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${game?.status === "ACTIVE" ? "text-primary" : game ? "text-ocean" : "text-slate-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${game?.status === "ACTIVE" ? "animate-pulse bg-primary" : game ? "bg-ocean" : court.active ? "bg-slate-300" : "bg-amber-400"}`} />
                  {!court.active ? "Paused" : game?.status === "ACTIVE" ? "Playing" : game ? "Staged" : "Ready"}
                </span>
              </div>
              <div className="p-3">
                {game ? (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    {[1, 2].map((team, index) => (
                      <div key={team} className="contents">
                        {index === 1 ? <span className="text-[10px] font-black text-slate-300">VS</span> : null}
                        <div className={`rounded-lg border p-2 text-center ${game.status === "ACTIVE" ? "border-primary/20 bg-primary-soft/60" : "border-slate-200"}`}>
                          {game.players.filter((player) => player.team === team).map((player) => <p key={player.participantId} className="truncate text-xs font-bold text-navy">{player.displayName}</p>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-4 text-center text-xs text-slate-500">{court.active ? "Ready for the next match." : "Rotation paused for this court."}</p>}
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

function hasParticipantPrimaryAction(status: ParticipantStatus) {
  return [
    "PENDING_APPROVAL",
    "NOT_CHECKED_IN",
    "CHECKED_OUT",
    "QUEUED",
    "PAUSED",
  ].includes(status);
}

function hasParticipantMoreActions(status: ParticipantStatus) {
  const canCheckOut = ["NOT_CHECKED_IN", "QUEUED", "PAUSED"].includes(
    status
  );
  const canRemove = ![
    "STAGED",
    "PLAYING",
    "REMOVED",
    "PENDING_APPROVAL",
  ].includes(status);
  const canEdit = !["REMOVED", "PENDING_APPROVAL"].includes(status);
  return status === "PENDING_APPROVAL" || canCheckOut || canRemove || canEdit;
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
  const hasActions = hasParticipantMoreActions(participant.status);

  if (!hasActions) return null;
  return (
    <details className="relative z-10 shrink-0 open:z-30">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        More
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 flex w-[min(18rem,calc(100vw-3rem))] flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
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

function ParticipantRoster({
  snapshot,
  readOnly = false,
}: {
  snapshot: OpenPlaySnapshot;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RosterFilter>("ACTIVE");
  const [bulkNotice, setBulkNotice] = useState<OpenPlayActionState>({});
  const clearSubmittedSelection = (formData: FormData) => {
    const submitted = new Set(formData.getAll("participantId").map(String));
    setSelected((current) => {
      const next = new Set(current);
      submitted.forEach((id) => next.delete(id));
      return next;
    });
  };
  const [, bulkCheckInAction, checkInPending] = useActionState(
    async (previous: OpenPlayActionState, formData: FormData) => {
      const result = await runBunalQActionSafely(
        bulkCheckInOpenPlayParticipantsAction,
        previous,
        formData
      );
      setBulkNotice(result);
      if (result.success) clearSubmittedSelection(formData);
      return result;
    },
    {}
  );
  const [, bulkPauseAction, pausePending] = useActionState(
    async (previous: OpenPlayActionState, formData: FormData) => {
      const result = await runBunalQActionSafely(
        bulkPauseOpenPlayParticipantsAction,
        previous,
        formData
      );
      setBulkNotice(result);
      if (result.success) clearSubmittedSelection(formData);
      return result;
    },
    {}
  );
  const [, bulkRemoveAction, removePending] = useActionState(
    async (previous: OpenPlayActionState, formData: FormData) => {
      const result = await runBunalQActionSafely(
        bulkRemoveOpenPlayParticipantsAction,
        previous,
        formData
      );
      setBulkNotice(result);
      if (result.success) clearSubmittedSelection(formData);
      return result;
    },
    {}
  );
  const bulkPending = checkInPending || pausePending || removePending;
  const activeCount = snapshot.participants.filter((player) => player.status !== "REMOVED").length;
  const sortedParticipants = useMemo(
    () => GROUPS.flatMap(([status]) => snapshot.participants.filter((player) => player.status === status)),
    [snapshot.participants]
  );
  const visibleParticipants = filter === "ACTIVE"
    ? sortedParticipants.filter((player) => player.status !== "REMOVED")
    : sortedParticipants.filter((player) => player.status === filter);
  const selectable = readOnly
    ? []
    : visibleParticipants.filter((player) =>
        ["NOT_CHECKED_IN", "CHECKED_OUT", "QUEUED", "PAUSED"].includes(
          player.status
        )
      );
  const selectableIds = new Set(
    snapshot.participants
      .filter(
        (player) =>
          !readOnly &&
          ["NOT_CHECKED_IN", "CHECKED_OUT", "QUEUED", "PAUSED"].includes(
            player.status
          )
      )
      .map((player) => player.id)
  );
  const selectedIds = [...selected].filter((id) => selectableIds.has(id));
  const selectedPlayers = snapshot.participants.filter((player) =>
    selectedIds.includes(player.id)
  );
  const checkInIds = selectedPlayers
    .filter((player) => ["NOT_CHECKED_IN", "CHECKED_OUT"].includes(player.status))
    .map((player) => player.id);
  const pauseIds = selectedPlayers
    .filter((player) => player.status === "QUEUED")
    .map((player) => player.id);
  const removeIds = selectedPlayers.map((player) => player.id);
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
    selectable.forEach((player) => {
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
        {!readOnly && snapshot.queue.kind === "EVENT" ? <ActionForm action={syncOpenPlayRosterAction} values={{ sessionId: snapshot.id }} label="Refresh" tone="quiet" /> : null}
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
      {selectable.length > 0 ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 sm:px-5">
          <input
            type="checkbox"
            checked={selectable.every((player) => selected.has(player.id))}
            onChange={(event) => selectVisibleEligible(event.target.checked)}
          />
          Select actionable players in this view
        </label>
      ) : null}
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-4 lg:grid-cols-3">
        {visibleParticipants.length === 0 ? (
          <p className="col-span-full px-4 py-10 text-center text-sm text-slate-500">No players in this view.</p>
        ) : visibleParticipants.map((player) => {
          const groupLabel = GROUPS.find(([status]) => status === player.status)?.[1] ?? player.status;
          const isEligible = ["NOT_CHECKED_IN", "CHECKED_OUT", "QUEUED", "PAUSED"].includes(player.status);
          const hasActions =
            !readOnly &&
            (hasParticipantPrimaryAction(player.status) ||
              hasParticipantMoreActions(player.status));
          const queueNumber = player.queuePosition
            ? snapshot.participants.filter(
                (item) => item.status === "QUEUED" && (item.queuePosition ?? 0) <= player.queuePosition!
              ).length
            : null;
          return (
            <article
              key={player.id}
              className={`relative flex h-full min-w-0 flex-col rounded-xl border transition hover:shadow-sm ${
                player.status === "PENDING_APPROVAL"
                  ? "border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-50"
                  : player.status === "REMOVED"
                    ? "border-slate-200 bg-slate-50/60 opacity-60"
                    : "border-slate-200 bg-white hover:border-primary/25"
              }`}
            >
              <div className="flex flex-1 flex-col p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {isEligible ? (
                      <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200">
                        <input
                          type="checkbox"
                          checked={selected.has(player.id)}
                          onChange={() => toggle(player.id)}
                          aria-label={`Select ${player.displayName}`}
                        />
                      </label>
                    ) : (
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                        queueNumber ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-500"
                      }`}>
                        {queueNumber ?? player.displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-navy">{player.displayName}</p>
                      <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {player.source.toLowerCase().replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${STATUS_STYLES[player.status]}`}>
                    {groupLabel}
                  </span>
                </div>

                <div className={`mt-4 grid grid-cols-2 gap-3 border-t pt-3 ${
                  player.status === "PENDING_APPROVAL"
                    ? "border-amber-200/70"
                    : "border-slate-100"
                }`}>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Skill</p>
                    <p className="mt-0.5 text-xs font-bold capitalize text-slate-600">{player.skillLevel}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Estimated wait</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-600">
                      {player.estimatedWaitMinutes ? `~${player.estimatedWaitMinutes}m` : "—"}
                    </p>
                  </div>
                </div>
              </div>
              {hasActions ? (
                <div className={`mt-auto flex items-start justify-end gap-2 border-t px-4 py-3 ${
                  player.status === "PENDING_APPROVAL"
                    ? "border-amber-200 bg-amber-100/30"
                    : "border-slate-200 bg-slate-50/80"
                }`}>
                  <ParticipantPrimaryAction
                    snapshot={snapshot}
                    participant={player}
                  />
                  <ParticipantMoreActions
                    snapshot={snapshot}
                    participant={player}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {bulkNotice.success ?? bulkNotice.message}
      </p>
      {selectedIds.length > 0 ? (
        <div className="sticky bottom-3 z-20 mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-navy p-3 text-white shadow-xl sm:mx-5 sm:px-4">
          <div className="min-w-32 flex-1">
            <p className="text-xs font-black">{selectedIds.length} selected</p>
            {bulkNotice.success || bulkNotice.message ? (
              <p className={`mt-1 text-xs font-bold ${bulkNotice.success ? "text-emerald-300" : "text-red-300"}`}>
                {bulkNotice.success ?? bulkNotice.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {checkInIds.length > 0 ? (
              <form action={bulkCheckInAction}>
                <input type="hidden" name="sessionId" value={snapshot.id} />
                {checkInIds.map((id) => <input key={id} type="hidden" name="participantId" value={id} />)}
                <button disabled={bulkPending} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black disabled:opacity-50">
                  {checkInPending ? "Checking in…" : `Check in ${checkInIds.length}`}
                </button>
              </form>
            ) : null}
            {pauseIds.length > 0 ? (
              <form action={bulkPauseAction}>
                <input type="hidden" name="sessionId" value={snapshot.id} />
                {pauseIds.map((id) => <input key={id} type="hidden" name="participantId" value={id} />)}
                <button disabled={bulkPending} className="min-h-9 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-black hover:bg-white/15 disabled:opacity-50">
                  {pausePending ? "Moving…" : `Break ${pauseIds.length}`}
                </button>
              </form>
            ) : null}
            {removeIds.length > 0 ? (
              <form
                action={bulkRemoveAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Remove ${removeIds.length} selected player${removeIds.length === 1 ? "" : "s"} from this run?`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="sessionId" value={snapshot.id} />
                {removeIds.map((id) => <input key={id} type="hidden" name="participantId" value={id} />)}
                <button disabled={bulkPending} className="min-h-9 rounded-lg bg-red-500/15 px-3 text-xs font-black text-red-200 hover:bg-red-500/25 disabled:opacity-50">
                  {removePending ? "Removing…" : `Remove ${removeIds.length}`}
                </button>
              </form>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setBulkNotice({});
              }}
              disabled={bulkPending}
              aria-label="Clear player selection"
              className="min-h-9 rounded-lg px-3 text-xs font-black text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EditParticipantForm({ snapshot, participant }: { snapshot: OpenPlaySnapshot; participant: OpenPlaySnapshot["participants"][number] }) {
  const [state, action, pending] = useBunalQActionState(editOpenPlayParticipantAction);
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
    <div className="space-y-6">
      <OpenPlayLiveRefresh publicId={snapshot.queue.publicId} />
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Pending approval", pending], ["Waiting queue", waiting], ["Currently playing", playing], ["Active courts", `${activeCourts}/${snapshot.courts.length}`]].map(([label, value], index) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400 sm:text-[10px]">{label}</p>
              <span className={`h-2 w-2 shrink-0 rounded-full ${index === 0 && pending > 0 ? "bg-amber-400" : index === 2 && playing > 0 ? "bg-primary" : "bg-slate-200"}`} />
            </div>
            <p className="mt-1 text-xl font-black text-navy sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>
      {canManage ? <>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black ${snapshot.status === "ACTIVE" ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}>{snapshot.runNumber}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-navy">Run controls</p>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${snapshot.status === "ACTIVE" ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-500"}`}>{snapshot.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]} · {snapshot.queue.kind === "QUICK" ? "Quick Queue" : "Event roster"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshot.status === "SETUP" ? <ActionForm action={startOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="Start run" /> : null}
            {snapshot.status !== "ENDED" ? <ActionForm action={endOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="End run" tone="danger" confirm="End this run? Staged and active matches will be cancelled." /> : null}
            {snapshot.status === "ENDED" ? <ActionForm action={startNewOpenPlayRunAction} values={{ sessionId: snapshot.id }} label="Start new run" confirm="Create a fresh run and reset copied players to not checked in?" /> : null}
          </div>
        </div>
        {snapshot.status !== "ENDED" ? (
          <>
            <ModeForm snapshot={snapshot} />
            <PairForm snapshot={snapshot} />
            {pairs.size > 0 ? <div className="flex flex-wrap gap-2">{[...pairs.entries()].map(([pairId, names]) => <div key={pairId} className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"><span>{names.join(" + ")}</span><ActionForm action={unpairOpenPlayParticipantsAction} values={{ sessionId: snapshot.id, pairId }} label="Unpair" tone="quiet" /></div>)}</div> : null}
            <div className="space-y-6">
              <div>{snapshot.status === "ACTIVE" ? <MatchControls snapshot={snapshot} /> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Start the run to stage matches.</p>}</div>
              <div className={snapshot.queue.kind === "QUICK" ? "grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]" : ""}>
                <AdmissionForm snapshot={snapshot} />
                <WalkInForm snapshot={snapshot} />
              </div>
              <ParticipantRoster snapshot={snapshot} />
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              This run is archived. Its roster and results are read-only.
            </p>
            <ParticipantRoster snapshot={snapshot} readOnly />
          </div>
        )}
      </> : null}
      <section className="border-t border-slate-200 pt-8 sm:pt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Public display</p>
            <h2 className="mt-1 text-xl font-black text-navy sm:text-2xl">Player board preview</h2>
            <p className="mt-1 text-xs text-slate-500">This is what players see on the shared live board.</p>
          </div>
          <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">Live preview</span>
        </div>
        <OpenPlayBoard snapshot={snapshot} />
      </section>
    </div>
  );
}
