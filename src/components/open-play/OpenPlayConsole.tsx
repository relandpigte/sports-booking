"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

import { CopyLiveLinkButton } from "@/components/open-play/CopyLiveLinkButton";
import { MatchTimer } from "@/components/open-play/MatchTimer";
import { OpenPlayCounts } from "@/components/open-play/OpenPlayCounts";
import { OpenPlayBoard } from "@/components/open-play/OpenPlayBoard";
import { OpenPlayLiveRefresh } from "@/components/open-play/OpenPlayLiveRefresh";
import {
  liveCourtCardClassName,
  liveCourtHeaderClassName,
  liveMatchPalette,
  openPlayThreeColumnGridClass,
} from "@/components/open-play/openPlayColors";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  addOpenPlayCourtAction,
  addOpenPlayUpNextSlotAction,
  addOpenPlayWalkInAction,
  approvePublicQueueGuestAction,
  bulkCheckInOpenPlayParticipantsAction,
  changeOpenPlayModeAction,
  checkInOpenPlayParticipantAction,
  checkOutOpenPlayParticipantAction,
  editOpenPlayParticipantAction,
  dispatchOpenPlayUpNextAction,
  endOpenPlaySessionAction,
  fillOpenPlaySlotAction,
  pairOpenPlayParticipantsAction,
  prepareOpenPlayAction,
  recordOpenPlayWinnerAction,
  rebuildOpenPlayUpNextMatchAction,
  refreshOpenPlayUpNextAction,
  rejectPublicQueueGuestAction,
  removeOpenPlayCourtAction,
  removeOpenPlayParticipantAction,
  removeOpenPlayUpNextSlotAction,
  replaceStagedCourtMatchAction,
  resumeOpenPlayParticipantAction,
  returnOpenPlayParticipantToQueueAction,
  startNewOpenPlayRunAction,
  startOpenPlayMatchAction,
  startOpenPlaySessionAction,
  swapOpenPlayWinnerAction,
  switchOpenPlayTeamsAction,
  syncOpenPlayRosterAction,
  toggleOpenPlayCourtAction,
  undoOpenPlayResultAction,
  unpairOpenPlayParticipantsAction,
} from "@/lib/open-play-actions";
import {
  OPEN_PLAY_MODE_DESCRIPTIONS,
  OPEN_PLAY_MODE_LABELS,
  OPEN_PLAY_MAX_UP_NEXT_SLOTS,
  OPEN_PLAY_MODES,
  type OpenPlayActionState,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";
import { DEFAULT_SKILL_LEVEL, SKILL_LEVELS } from "@/lib/constants";
import {
  useBunalQActionState,
  type BunalQAction,
} from "@/hooks/useBunalQActionState";
import { useNow } from "@/hooks/useNow";

function FeedbackMessage({ state }: { state: OpenPlayActionState }) {
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

// Confirmations fade after a few seconds so they don't pile up across the
// console; errors stay until the next attempt so they can be read.
function Feedback({
  state,
  delay = 4_000,
}: {
  state: OpenPlayActionState;
  delay?: number;
}) {
  const [dismissedState, setDismissedState] = useState<OpenPlayActionState>();
  useEffect(() => {
    if (!state.success) return;
    const timeout = window.setTimeout(() => setDismissedState(state), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, state]);
  if (state.success && dismissedState === state) return null;
  return <FeedbackMessage state={state} />;
}

function ActionForm({
  action,
  values,
  label,
  className = "",
  buttonClassName,
  tone = "default",
  confirm,
}: {
  action: BunalQAction;
  values: Record<string, string | number | boolean>;
  label: string;
  className?: string;
  buttonClassName?: string;
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
          buttonClassName
            ? buttonClassName
            : tone === "danger"
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
          <p className="mt-1 text-xs text-slate-500">Changes rebuild untouched automatic matchups while preserving manual edits.</p>
        </div>
        <button disabled={pending || selected === snapshot.matchingMode} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black text-white disabled:opacity-40">
          {pending ? "Saving…" : "Apply mode"}
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

function PairForm({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [state, action, pending] = useBunalQActionState(pairOpenPlayParticipantsAction);
  const eligible = snapshot.participants.filter((participant) =>
    ["NOT_CHECKED_IN", "QUEUED", "STAGED", "PLAYING", "PAUSED", "CHECKED_OUT"].includes(participant.status)
  );
  if (!["BALANCED", "ROUND_ROBIN", "FIXED_PARTNERS"].includes(snapshot.matchingMode)) return null;
  const options = eligible.map((participant) => ({
    value: participant.id,
    label: `${participant.displayName}${
      participant.status === "PLAYING"
        ? " · Playing"
        : participant.status === "STAGED"
          ? " · Up Next"
          : ""
    }`,
  }));
  return (
    <form action={action} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm shadow-navy/5">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      <div>
        <h2 className="text-xs font-black uppercase tracking-[0.16em] text-amber-950">Pair players</h2>
        <p className="mt-1 text-xs text-amber-900/70">Pairs stay together; active games stay put.</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Select name="firstId" label="Player 1" options={options} />
        <Select name="secondId" label="Player 2" options={options} />
        <Button className="min-h-10 px-4 py-2 sm:w-auto" disabled={pending || options.length < 2}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function SavedPairs({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const pairs = new Map<string, string[]>();
  snapshot.participants.forEach((participant) => {
    if (participant.pairId) {
      pairs.set(participant.pairId, [
        ...(pairs.get(participant.pairId) ?? []),
        participant.displayName,
      ]);
    }
  });
  if (pairs.size === 0) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 shadow-sm shadow-navy/5">
      <div className="mr-auto shrink-0">
        <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-950">Fixed partners</h2>
        <p className="mt-0.5 text-[11px] text-amber-900/60">{pairs.size} saved {pairs.size === 1 ? "pair" : "pairs"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...pairs.entries()].map(([pairId, names]) => (
          <div key={pairId} className="flex items-center rounded-lg border border-amber-200 bg-white pl-3 text-xs font-bold text-amber-900 shadow-sm">
            <span className="whitespace-nowrap">{names.join(" + ")}</span>
            <ActionForm
              action={unpairOpenPlayParticipantsAction}
              values={{ sessionId: snapshot.id, pairId }}
              label="Unpair"
              buttonClassName="ml-2 rounded-l-none border-l border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DispatchUpNextForm({
  snapshot,
  gameId,
  freeCourts,
}: {
  snapshot: OpenPlaySnapshot;
  gameId: string;
  freeCourts: OpenPlaySnapshot["courts"];
}) {
  const [state, action, pending] = useBunalQActionState(
    dispatchOpenPlayUpNextAction
  );
  if (freeCourts.length === 0) {
    return (
      <div className="mt-3 flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
        <span>Queued for next available court</span>
        <span className="text-violet-600">Automatic</span>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <div className={`grid gap-2 ${freeCourts.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {freeCourts.map((court) => (
          <form key={court.id} action={action}>
            <input type="hidden" name="sessionId" value={snapshot.id} />
            <input type="hidden" name="gameId" value={gameId} />
            <input type="hidden" name="courtId" value={court.id} />
            <button
              disabled={pending}
              className="min-h-10 w-full rounded-xl bg-primary px-3 text-xs font-black text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Sending…" : `Send to ${court.name}`}
            </button>
          </form>
        ))}
      </div>
      <Feedback state={state} />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

// A small × button that submits one action; errors float below it so the
// row it sits in keeps its height.
function IconActionForm({
  action,
  values,
  label,
  confirm,
  className = "",
}: {
  action: BunalQAction;
  values: Record<string, string | number>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useBunalQActionState(action);
  return (
    <form
      action={formAction}
      className={`relative shrink-0 ${className}`}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      <button
        type="submit"
        disabled={pending}
        title={label}
        aria-label={label}
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50"
      >
        <CloseIcon />
      </button>
      {state.message ? (
        <span className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg bg-red-50 p-2 text-left text-[10px] font-bold text-red-700 shadow-lg" role="alert">
          {state.message}
        </span>
      ) : (
        <span className="sr-only" aria-live="polite">{state.success}</span>
      )}
    </form>
  );
}

function ReturnToQueueForm({
  snapshot,
  participantId,
  displayName,
}: {
  snapshot: OpenPlaySnapshot;
  participantId: string;
  displayName: string;
}) {
  return (
    <IconActionForm
      action={returnOpenPlayParticipantToQueueAction}
      values={{ sessionId: snapshot.id, participantId }}
      label={`Return ${displayName} to the queue`}
    />
  );
}

function ReplaceStagedCourtMatchForm({
  snapshot,
  courtGameId,
  upNext,
}: {
  snapshot: OpenPlaySnapshot;
  courtGameId: string;
  upNext: OpenPlaySnapshot["games"];
}) {
  const [state, action, pending] = useBunalQActionState(
    replaceStagedCourtMatchAction
  );
  if (upNext.length === 0) return null;
  return (
    <div className="col-span-3 mt-1 border-t border-slate-100 pt-2">
      <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
        Replace with
      </p>
      <div className={`grid gap-1.5 ${upNext.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {upNext.map((game, index) => (
          <form key={game.id} action={action}>
            <input type="hidden" name="sessionId" value={snapshot.id} />
            <input type="hidden" name="courtGameId" value={courtGameId} />
            <input type="hidden" name="replacementGameId" value={game.id} />
            <button
              disabled={pending}
              className="min-h-9 w-full rounded-lg border border-violet-200 bg-violet-50 px-2 text-[10px] font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50"
            >
              {pending ? "Replacing…" : `Up next ${index + 1}`}
            </button>
          </form>
        ))}
      </div>
      <Feedback state={state} />
    </div>
  );
}

type Game = OpenPlaySnapshot["games"][number];
type SlotTarget = {
  gameId: string;
  slot: number;
  context: string;
  openedAt: number;
  // Set when the spot belongs to a player being swapped out.
  replace?: { participantId: string; displayName: string };
};

type MatchPlayerTarget = {
  gameId: string;
  participantId: string;
  context: string;
};

function PlayerNameButton({
  name,
  onClick,
  className = "text-xs font-bold",
}: {
  name: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 flex-1 truncate text-left text-navy underline-offset-2 transition hover:text-primary hover:underline ${className}`}
    >
      {name}
    </button>
  );
}

// Slots 1-2 are Team 1 and 3-4 Team 2, so an open spot keeps its team.
function teamSlots(game: Game, team: number) {
  return (team === 1 ? [1, 2] : [3, 4]).map((slot) => ({
    slot,
    player: game.players.find((player) => player.slot === slot),
  }));
}

function OpenSlotButton({
  onChoose,
}: {
  onChoose: (openedAt: number) => void;
}) {
  return (
    <button
      type="button"
      // The clock is read on click so waiting times in the picker are stable.
      onClick={() => onChoose(Date.now())}
      className="flex min-h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white/70 px-2 text-[11px] font-black text-slate-500 transition hover:border-primary hover:text-primary"
    >
      <span aria-hidden="true">+</span> Choose player
    </button>
  );
}

function ChoosePlayerDialog({
  snapshot,
  target,
  onClose,
}: {
  snapshot: OpenPlaySnapshot;
  target: SlotTarget;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useBunalQActionState(fillOpenPlaySlotAction);
  const [query, setQuery] = useState("");
  const team = target.slot <= 2 ? 1 : 2;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  const records = new Map(
    snapshot.standings.map((row) => [row.participantId, row])
  );
  const queued = snapshot.participants
    .filter((participant) => participant.status === "QUEUED")
    .sort(
      (left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0)
    );
  // Players already in another match that hasn't started can be moved here;
  // Up next boxes come first, then matches waiting on a court.
  const upNextGames = snapshot.games
    .filter((game) => game.status === "STAGED" && !game.courtId)
    .sort((left, right) => left.sequence - right.sequence);
  const courtStaged = snapshot.games
    .filter((game) => game.status === "STAGED" && game.courtId)
    .sort((left, right) => left.sequence - right.sequence);
  const staged = [
    ...upNextGames.map((game, index) => ({ game, label: `Up next ${index + 1}` })),
    ...courtStaged.map((game) => ({ game, label: game.courtName ?? "Court" })),
  ]
    .filter(({ game }) => game.id !== target.gameId)
    .flatMap(({ game, label }) =>
      [...game.players]
        .sort((left, right) => left.slot - right.slot)
        .map((player) => ({ id: player.participantId, displayName: player.displayName, label }))
    );
  const search = query.trim().toLowerCase();
  const nameMatches = (name: string) => name.toLowerCase().includes(search);
  const matches = search
    ? queued.filter((participant) => nameMatches(participant.displayName))
    : queued;
  const stagedMatches = search
    ? staged.filter((player) => nameMatches(player.displayName))
    : staged;
  const participantsById = new Map(
    snapshot.participants.map((participant) => [participant.id, participant])
  );
  const hidden: Record<string, string> = {
    sessionId: snapshot.id,
    gameId: target.gameId,
    slot: String(target.slot),
    ...(target.replace ? { replaceParticipantId: target.replace.participantId } : {}),
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="choose-player-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl p-0 backdrop:bg-navy/60 sm:w-full"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col p-5 sm:p-6">
        <h2 id="choose-player-title" className="text-xl font-black text-navy">
          {target.replace ? `Replace ${target.replace.displayName}` : "Choose a player"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Select from the queue or Up next, or search by name.
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <span
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black uppercase text-white ${
              team === 1 ? "bg-indigo-600" : "bg-rose-600"
            }`}
          >
            Team {team}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-500">
              {target.replace ? "Replacing on" : "Adding to"} {target.context}
            </p>
            <p className="text-sm font-black text-navy">
              Player {((target.slot - 1) % 2) + 1} of 2
            </p>
          </div>
        </div>

        <form action={action} className="mt-4">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="pick" value="auto" />
          <button
            disabled={pending || queued.length === 0}
            className="min-h-12 w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Picking…" : "Auto-pick best match"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs font-semibold text-slate-400">
          <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          or pick manually
          <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players…"
          aria-label="Search players"
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {matches.map((participant) => {
            const record = records.get(participant.id);
            const waited = participant.queuedAt
              ? Math.max(
                  0,
                  Math.round(
                    (target.openedAt - Date.parse(participant.queuedAt)) /
                      60_000
                  )
                )
              : null;
            return (
              <li key={participant.id}>
                <form action={action}>
                  {Object.entries(hidden).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="pick" value="manual" />
                  <input type="hidden" name="participantId" value={participant.id} />
                  <button
                    disabled={pending}
                    className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-left transition hover:bg-primary-soft disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-black text-navy">
                      {participant.displayName}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-slate-500">
                      {SKILL_LEVELS.find((level) => level.value === participant.skillLevel)?.label ?? participant.skillLevel}
                      {" · "}#{queued.indexOf(participant) + 1} in queue
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {record?.games ?? 0} games · {record?.wins ?? 0}W-{record?.losses ?? 0}L
                      {waited !== null ? ` · Waiting ${waited} min` : ""}
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
          {matches.length === 0 && stagedMatches.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              {queued.length === 0 && staged.length === 0
                ? "No one is waiting in the queue or Up next."
                : "No player matches that name."}
            </li>
          ) : null}
          {stagedMatches.length > 0 ? (
            <li className="px-1 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              From Up next · leaves an open spot there
            </li>
          ) : null}
          {stagedMatches.map((player) => {
            const participant = participantsById.get(player.id);
            const record = records.get(player.id);
            return (
              <li key={player.id}>
                <form action={action}>
                  {Object.entries(hidden).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="pick" value="manual" />
                  <input type="hidden" name="participantId" value={player.id} />
                  <button
                    disabled={pending}
                    className="w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left transition hover:bg-primary-soft disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-black text-navy">
                      {player.displayName}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-slate-500">
                      {participant ? `${SKILL_LEVELS.find((level) => level.value === participant.skillLevel)?.label ?? participant.skillLevel} · ` : ""}
                      In {player.label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {record?.games ?? 0} games · {record?.wins ?? 0}W-{record?.losses ?? 0}L
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <Feedback state={state} />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-12 w-full shrink-0 rounded-2xl bg-slate-100 text-sm font-black text-navy transition hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}

function AddCourtControl({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const option = snapshot.courtAdd;
  if (!option) return null;
  if (option.kind === "AUTO") {
    return option.remaining > 0 ? (
      <ActionForm action={addOpenPlayCourtAction} values={{ sessionId: snapshot.id }} label="+ Add court" tone="quiet" />
    ) : null;
  }
  return (
    <details className="relative z-20">
      <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        + Add court
      </summary>
      <div className="absolute right-0 top-full mt-2 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        {option.courts.length === 0 ? (
          <p className="text-xs text-slate-500">
            {snapshot.queue.kind === "EVENT"
              ? "Every court reserved for this event is already in the run or in use."
              : "No other pickleball court at this hub is free."}
          </p>
        ) : (
          option.courts.map((court) => (
            <ActionForm
              key={court.id}
              action={addOpenPlayCourtAction}
              values={{ sessionId: snapshot.id, courtId: court.id }}
              label={`Add ${court.name}`}
              buttonClassName="w-full border border-slate-200 bg-white text-left text-slate-700 hover:bg-slate-50"
            />
          ))
        )}
      </div>
    </details>
  );
}

// Waiting time as H:MM:SS, matching the clocks organizers see at the venue.
function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function skillLabel(value: string): string {
  return SKILL_LEVELS.find((level) => level.value === value)?.label ?? value;
}

type Participant = OpenPlaySnapshot["participants"][number];

const PAIRING_MODES = ["BALANCED", "ROUND_ROBIN", "FIXED_PARTNERS"];
const PAIRABLE_STATUSES = ["NOT_CHECKED_IN", "QUEUED", "STAGED", "PLAYING", "PAUSED", "CHECKED_OUT"];
const LEFT_STATUSES = ["CHECKED_OUT", "PAUSED", "NOT_CHECKED_IN"];
const manilaClock = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

function Modal({
  labelledBy,
  onClose,
  children,
  className = "max-w-md",
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first control (the close button); a field
    // marked data-autofocus takes focus instead.
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={labelledBy}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-3xl p-0 backdrop:bg-navy/60 sm:w-full ${className}`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto p-5 sm:p-6">
        {children}
      </div>
    </dialog>
  );
}

function ModalTitle({
  id,
  title,
  onClose,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-xl font-black text-navy">{title}</h2>
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-navy"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function presenceLabel(participant: Participant): string {
  switch (participant.status) {
    case "QUEUED":
    case "STAGED":
    case "PLAYING":
      return "Currently checked in";
    case "PAUSED":
      return "On break";
    case "CHECKED_OUT":
      return "Left";
    case "NOT_CHECKED_IN":
      return "Not checked in";
    case "PENDING_APPROVAL":
      return "Waiting for approval";
    default:
      return "Removed";
  }
}

function PlayerDetailsDialog({
  snapshot,
  participantId,
  onClose,
}: {
  snapshot: OpenPlaySnapshot;
  participantId: string;
  onClose: () => void;
}) {
  const participant = snapshot.participants.find((item) => item.id === participantId);
  const [nameState, nameAction, namePending] = useBunalQActionState(editOpenPlayParticipantAction);
  const [skillState, skillAction, skillPending] = useBunalQActionState(editOpenPlayParticipantAction);
  const [pairing, setPairing] = useState(false);
  const pairAndClose = useCallback<BunalQAction>(async (previous, formData) => {
    const result = await pairOpenPlayParticipantsAction(previous, formData);
    if (result.success) setPairing(false);
    return result;
  }, []);
  const [pairState, pairAction, pairPending] = useBunalQActionState(pairAndClose);
  // Both fields save separately, so each form sends the other's latest
  // value rather than the snapshot's, which lags behind until it refreshes.
  const [name, setName] = useState(participant?.displayName ?? "");
  const [skill, setSkill] = useState(participant?.skillLevel ?? DEFAULT_SKILL_LEVEL);
  const [query, setQuery] = useState("");
  const submittedName = useRef(participant?.displayName ?? "");
  const missing = !participant || participant.status === "REMOVED";
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  if (!participant || missing) return null;

  const record = snapshot.standings.find((row) => row.participantId === participant.id);
  const games = record?.games ?? 0;
  const winRate = games > 0 ? Math.round(((record?.wins ?? 0) / games) * 100) : null;
  const values = { sessionId: snapshot.id, participantId: participant.id };
  const partner = participant.pairId
    ? snapshot.participants.find(
        (item) => item.pairId === participant.pairId && item.id !== participant.id
      )
    : undefined;
  const canPair =
    PAIRING_MODES.includes(snapshot.matchingMode) &&
    PAIRABLE_STATUSES.includes(participant.status);
  const search = query.trim().toLowerCase();
  const pairCandidates = snapshot.participants
    .filter(
      (item) =>
        item.id !== participant.id &&
        PAIRABLE_STATUSES.includes(item.status) &&
        item.displayName.toLowerCase().includes(search)
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const canRemove = !["STAGED", "PLAYING", "REMOVED", "PENDING_APPROVAL"].includes(participant.status);
  const saveName = (form: HTMLFormElement | null) => {
    const next = name.trim();
    if (!form || !next || next === participant.displayName || next === submittedName.current) return;
    submittedName.current = next;
    form.requestSubmit();
  };

  return (
    <Modal labelledBy="player-details-title" onClose={onClose}>
      <ModalTitle id="player-details-title" title={participant.displayName} onClose={onClose}>
        <p className="mt-1 text-sm text-slate-500">
          {games}G played
          {winRate !== null ? (
            <span className="ml-3 font-bold text-emerald-600">{winRate}% win rate</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {participant.checkedInAt
            ? `In ${manilaClock.format(new Date(participant.checkedInAt))} · `
            : ""}
          {presenceLabel(participant)}
        </p>
      </ModalTitle>

      <form
        action={nameAction}
        className="mt-5"
        onSubmit={() => {
          submittedName.current = name.trim();
        }}
      >
        <input type="hidden" name="sessionId" value={snapshot.id} />
        <input type="hidden" name="participantId" value={participant.id} />
        <input type="hidden" name="skillLevel" value={skill} />
        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500">
          Name
          <input
            name="displayName"
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => saveName(event.currentTarget.form)}
            className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold normal-case tracking-normal text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {namePending ? <p className="mt-1 text-xs text-slate-400">Saving…</p> : <Feedback state={nameState} />}
      </form>

      <form action={skillAction} className="mt-5">
        <input type="hidden" name="sessionId" value={snapshot.id} />
        <input type="hidden" name="participantId" value={participant.id} />
        <input type="hidden" name="displayName" value={name.trim() || participant.displayName} />
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Skill level</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SKILL_LEVELS.map((level) => (
            <button
              key={level.value}
              name="skillLevel"
              value={level.value}
              disabled={skillPending}
              onClick={() => setSkill(level.value)}
              aria-pressed={skill === level.value}
              className={`min-h-10 rounded-xl border text-xs font-black transition disabled:opacity-60 ${
                skill === level.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-slate-200 bg-white text-slate-600 hover:border-primary/40"
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
        <Feedback state={skillState} />
      </form>

      {canPair ? (
        <div className="mt-5">
          {partner ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-bold text-violet-800">🔗 Paired with {partner.displayName}</p>
              <ActionForm
                action={unpairOpenPlayParticipantsAction}
                values={{ sessionId: snapshot.id, pairId: participant.pairId ?? "" }}
                label="Unpair"
                buttonClassName="min-h-8 rounded-lg bg-white px-3 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
              />
            </div>
          ) : null}
          {!pairing ? (
            <button
              type="button"
              onClick={() => setPairing(true)}
              className="mt-2 min-h-12 w-full rounded-xl border border-violet-200 text-sm font-black text-violet-700 transition hover:bg-violet-50"
            >
              🔗 {partner ? "Pair with someone else" : "Pair with another player"}
            </button>
          ) : (
            <div className="mt-2 rounded-xl border border-violet-200 p-3">
              <input
                type="search"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players…"
                aria-label="Search players to pair with"
                className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {pairCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <form action={pairAction}>
                      <input type="hidden" name="sessionId" value={snapshot.id} />
                      <input type="hidden" name="firstId" value={participant.id} />
                      <input type="hidden" name="secondId" value={candidate.id} />
                      <button
                        disabled={pairPending}
                        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-bold text-navy hover:bg-violet-50 disabled:opacity-50"
                      >
                        <span className="truncate">{candidate.displayName}</span>
                        <span className="shrink-0 text-[10px] font-black uppercase text-slate-400">
                          {candidate.pairId ? "Paired" : presenceLabel(candidate)}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
                {pairCandidates.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-slate-500">No player matches that name.</li>
                ) : null}
              </ul>
              <button
                type="button"
                onClick={() => setPairing(false)}
                className="mt-2 text-xs font-black text-slate-500 hover:text-navy"
              >
                Cancel pairing
              </button>
            </div>
          )}
          <Feedback state={pairState} />
        </div>
      ) : null}

      {participant.status !== "STAGED" && participant.status !== "PLAYING" ? <div className="mt-6 flex flex-wrap items-start gap-2 border-t border-slate-100 pt-4">
        {participant.status === "QUEUED" ? (
          <ActionForm action={checkOutOpenPlayParticipantAction} values={values} label="Move to Left" tone="quiet" />
        ) : null}
        {participant.status === "PAUSED" ? (
          <ActionForm action={resumeOpenPlayParticipantAction} values={values} label="Check in" />
        ) : null}
        {["CHECKED_OUT", "NOT_CHECKED_IN"].includes(participant.status) ? (
          <ActionForm action={checkInOpenPlayParticipantAction} values={values} label="Check in" />
        ) : null}
        {participant.status === "PENDING_APPROVAL" ? (
          <>
            <ActionForm action={approvePublicQueueGuestAction} values={values} label="Approve + check in" />
            <ActionForm action={rejectPublicQueueGuestAction} values={values} label="Reject" tone="danger" />
          </>
        ) : null}
        {canRemove ? (
          <ActionForm
            action={removeOpenPlayParticipantAction}
            values={values}
            label="Remove from run"
            tone="danger"
            className="ml-auto"
            confirm={`Remove ${participant.displayName} from this run?`}
          />
        ) : null}
      </div> : null}
    </Modal>
  );
}

function MatchPlayerDialog({
  snapshot,
  target,
  onClose,
  onReplace,
  onEdit,
}: {
  snapshot: OpenPlaySnapshot;
  target: MatchPlayerTarget;
  onClose: () => void;
  onReplace: (slot: number, displayName: string) => void;
  onEdit: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [state, action, pending] = useBunalQActionState(switchOpenPlayTeamsAction);
  const game = snapshot.games.find(
    (item) => item.id === target.gameId && ["STAGED", "ACTIVE"].includes(item.status)
  );
  const player = game?.players.find((item) => item.participantId === target.participantId);
  const missing = !game || !player;
  useEffect(() => {
    if (missing || state.success) onClose();
  }, [missing, state, onClose]);
  if (!game || !player) return null;
  const otherTeam = player.team === 1 ? 2 : 1;
  const opponents = game.players
    .filter((item) => item.team === otherTeam)
    .sort((left, right) => left.slot - right.slot);
  const option = "flex w-full items-start gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Modal labelledBy="match-player-title" onClose={onClose}>
      <ModalTitle id="match-player-title" title={player.displayName} onClose={onClose}>
        <p className="mt-1 text-sm text-slate-500">
          {target.context} · <span className="font-bold uppercase">Team {player.team}</span>
        </p>
      </ModalTitle>
      <div className="mt-4 space-y-1">
        <button type="button" className={option} onClick={() => onReplace(player.slot, player.displayName)}>
          <span aria-hidden="true" className="mt-0.5 w-5 text-center text-lg text-navy">↔</span>
          <span>
            <span className="block text-base font-black text-navy">Replace player</span>
            <span className="block text-sm text-slate-500">Choose someone from the queue or Up next</span>
          </span>
        </button>
        <button
          type="button"
          className={option}
          disabled={opponents.length === 0}
          onClick={() => setSwitching((current) => !current)}
          aria-expanded={switching}
        >
          <span aria-hidden="true" className="mt-0.5 w-5 text-center text-lg text-navy">⇄</span>
          <span>
            <span className="block text-base font-black text-navy">Switch teams</span>
            <span className="block text-sm text-slate-500">Switch with someone on Team {otherTeam}</span>
          </span>
        </button>
        {switching ? (
          <div className="grid gap-2 pb-2 pl-12 pr-3 sm:grid-cols-2">
            {opponents.map((opponent) => (
              <form key={opponent.participantId} action={action}>
                <input type="hidden" name="sessionId" value={snapshot.id} />
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="participantId" value={player.participantId} />
                <input type="hidden" name="otherParticipantId" value={opponent.participantId} />
                <button
                  disabled={pending}
                  className="min-h-10 w-full truncate rounded-xl border border-slate-200 px-3 text-sm font-bold text-navy transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                >
                  {pending ? "Switching…" : `With ${opponent.displayName}`}
                </button>
              </form>
            ))}
            <div className="sm:col-span-2"><Feedback state={state} /></div>
          </div>
        ) : null}
        <div className="!my-3 border-t border-slate-100" />
        <button type="button" className={option} onClick={onEdit}>
          <span aria-hidden="true" className="mt-0.5 w-5 text-center text-lg text-navy">✎</span>
          <span className="block text-base font-black text-navy">Edit player details</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 min-h-12 w-full shrink-0 rounded-2xl bg-slate-100 text-sm font-black text-navy transition hover:bg-slate-200"
      >
        Cancel
      </button>
    </Modal>
  );
}

function AddPlayersDialog({
  snapshot,
  onClose,
}: {
  snapshot: OpenPlaySnapshot;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // The box clears as soon as a name is sent so staff can type the next one
  // straight away; a failed add puts the name back if nothing was typed since.
  const addAndClear = useCallback<BunalQAction>(async (previous, formData) => {
    const result = await addOpenPlayWalkInAction(previous, formData);
    if (!result.success) {
      const name = String(formData.get("displayName") ?? "");
      setQuery((current) => current || name);
    }
    return result;
  }, []);
  const [state, action, pending] = useBunalQActionState(addAndClear);
  const search = query.trim().toLowerCase();
  const returning = snapshot.participants
    .filter((participant) => LEFT_STATUSES.includes(participant.status))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const matches = search
    ? returning.filter((participant) => participant.displayName.toLowerCase().includes(search))
    : returning;
  const exact = returning.some(
    (participant) => participant.displayName.trim().toLowerCase() === search
  );
  const canAdd = search.length > 0 && !exact;

  return (
    <Modal labelledBy="add-players-title" onClose={onClose}>
      <ModalTitle id="add-players-title" title="Add players" onClose={onClose}>
        <p className="mt-1 text-sm text-slate-500">
          Search checked-out players, or add a walk-in to the Queue.
        </p>
      </ModalTitle>
      {/* Returning players are listed before the walk-in button, so the
          button sits outside this form and submits it by id. */}
      <form
        id="add-walk-in"
        action={action}
        className="mt-4"
        onSubmit={(event) => {
          if (!canAdd) {
            event.preventDefault();
            return;
          }
          setQuery("");
        }}
      >
        <input type="hidden" name="sessionId" value={snapshot.id} />
        <input type="hidden" name="publicId" value={snapshot.queue.publicId} />
        <input type="hidden" name="skillLevel" value={DEFAULT_SKILL_LEVEL} />
        <input
          name="displayName"
          value={query}
          data-autofocus="true"
          maxLength={120}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or add player…"
          aria-label="Search or add player"
          className="min-h-12 w-full rounded-xl border-2 border-primary/60 px-4 text-base text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </form>
      {matches.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {matches.map((participant) => (
            <li key={participant.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy">{participant.displayName}</p>
                <p className="text-xs text-slate-500">{skillLabel(participant.skillLevel)} · {presenceLabel(participant)}</p>
              </div>
              <ActionForm
                action={participant.status === "PAUSED" ? resumeOpenPlayParticipantAction : checkInOpenPlayParticipantAction}
                values={{ sessionId: snapshot.id, participantId: participant.id }}
                label="Check in"
                className="shrink-0 text-right"
                buttonClassName="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {canAdd ? (
        <button
          form="add-walk-in"
          className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-xl bg-primary px-4 text-left text-sm font-black text-white transition hover:bg-primary-hover"
        >
          <span aria-hidden="true">+</span>
          <span className="truncate">Add “{query.trim()}” to the queue</span>
        </button>
      ) : null}
      {pending ? <p className="mt-2 text-xs font-bold text-slate-400">Adding…</p> : <Feedback state={state} />}
      {matches.length === 0 && !canAdd && !pending ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No checked-out players. Type a name above to add a walk-in.
        </p>
      ) : null}
    </Modal>
  );
}

function QueuePanel({
  snapshot,
  onOpen,
  onAdd,
}: {
  snapshot: OpenPlaySnapshot;
  onOpen: (participantId: string) => void;
  onAdd: () => void;
}) {
  const now = useNow(1_000);
  const records = new Map(snapshot.standings.map((row) => [row.participantId, row]));
  const queued = snapshot.participants
    .filter((participant) => participant.status === "QUEUED")
    .sort((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0));
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-navy px-4 py-2.5">
        <h2 className="text-sm font-black text-white">
          Queue <span className="font-bold text-white/60">({queued.length})</span>
        </h2>
        <button
          type="button"
          onClick={onAdd}
          className="min-h-9 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/20"
        >
          + Add player
        </button>
      </div>
      {queued.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">No one is waiting right now.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {queued.map((participant, index) => {
            const games = records.get(participant.id)?.games ?? 0;
            return (
              <li key={participant.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-7 shrink-0 text-center text-lg font-black text-primary">{index + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <PlayerNameButton
                    name={participant.displayName}
                    onClick={() => onOpen(participant.id)}
                    className="max-w-full flex-none text-sm font-black"
                  />
                  <p className="text-xs font-semibold text-slate-500">
                    {skillLabel(participant.skillLevel)} · {games} {games === 1 ? "game" : "games"}
                    {now !== null && participant.queuedAt
                      ? ` · ⏱ Waiting ${formatClock(now - Date.parse(participant.queuedAt))}`
                      : ""}
                  </p>
                </div>
                <IconActionForm
                  action={checkOutOpenPlayParticipantAction}
                  values={{ sessionId: snapshot.id, participantId: participant.id }}
                  label={`Move ${participant.displayName} to Left`}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CheckInAllForm({ snapshot, ids }: { snapshot: OpenPlaySnapshot; ids: string[] }) {
  const [state, action, pending] = useBunalQActionState(bulkCheckInOpenPlayParticipantsAction);
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="sessionId" value={snapshot.id} />
      {ids.map((id) => <input key={id} type="hidden" name="participantId" value={id} />)}
      <button disabled={pending} className="min-h-8 rounded-lg bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
        {pending ? "Checking in…" : `Check in all ${ids.length}`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function LeftRow({
  snapshot,
  participant,
  onOpen,
}: {
  snapshot: OpenPlaySnapshot;
  participant: Participant;
  onOpen: (participantId: string) => void;
}) {
  const record = snapshot.standings.find((row) => row.participantId === participant.id);
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex min-w-0 flex-col items-start pt-1">
        <PlayerNameButton
          name={participant.displayName}
          onClick={() => onOpen(participant.id)}
          className="max-w-full flex-none text-sm font-bold"
        />
        <p className="text-xs text-slate-400">
          {record?.wins ?? 0}-{record?.losses ?? 0} ({record?.games ?? 0} games)
          {participant.status === "PAUSED" ? " · On break" : ""}
        </p>
      </div>
      <ActionForm
        action={participant.status === "PAUSED" ? resumeOpenPlayParticipantAction : checkInOpenPlayParticipantAction}
        values={{ sessionId: snapshot.id, participantId: participant.id }}
        label="Check in"
        className="shrink-0 text-right"
        buttonClassName="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      />
    </li>
  );
}

function LeftPanel({
  snapshot,
  onOpen,
}: {
  snapshot: OpenPlaySnapshot;
  onOpen: (participantId: string) => void;
}) {
  const byName = (first: Participant, second: Participant) =>
    first.displayName.localeCompare(second.displayName);
  const notCheckedIn = snapshot.participants
    .filter((participant) => participant.status === "NOT_CHECKED_IN")
    .sort(byName);
  const left = snapshot.participants
    .filter((participant) => participant.status === "CHECKED_OUT" || participant.status === "PAUSED")
    .sort(byName);
  if (notCheckedIn.length === 0 && left.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {notCheckedIn.length > 0 ? (
        <div className={left.length > 0 ? "mb-5" : ""}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="pt-1 text-sm font-black text-slate-500">
              Not checked in <span className="font-bold">({notCheckedIn.length})</span>
            </h2>
            {notCheckedIn.length > 1 ? (
              <CheckInAllForm snapshot={snapshot} ids={notCheckedIn.map((participant) => participant.id)} />
            ) : null}
          </div>
          <ul className="mt-3 grid gap-2">
            {notCheckedIn.map((participant) => (
              <LeftRow key={participant.id} snapshot={snapshot} participant={participant} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      ) : null}
      {left.length > 0 ? (
        <>
          <h2 className="text-sm font-black text-slate-500">
            Left <span className="font-bold">({left.length})</span>
          </h2>
          <ul className="mt-3 grid gap-2">
            {left.map((participant) => (
              <LeftRow key={participant.id} snapshot={snapshot} participant={participant} onOpen={onOpen} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function RequestsPanel({
  snapshot,
  onOpen,
}: {
  snapshot: OpenPlaySnapshot;
  onOpen: (participantId: string) => void;
}) {
  const requests = snapshot.participants.filter(
    (participant) => participant.status === "PENDING_APPROVAL"
  );
  if (requests.length === 0) return null;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <h2 className="text-sm font-black text-amber-900">
        Earlier join requests <span className="font-bold">({requests.length})</span>
      </h2>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {requests.map((participant) => (
          <li key={participant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
            <div className="flex min-w-0 flex-col items-start">
              <PlayerNameButton
                name={participant.displayName}
                onClick={() => onOpen(participant.id)}
                className="max-w-full flex-none text-sm font-bold"
              />
              <p className="text-xs text-slate-500">{skillLabel(participant.skillLevel)}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <ActionForm
                action={approvePublicQueueGuestAction}
                values={{ sessionId: snapshot.id, participantId: participant.id }}
                label="Approve"
              />
              <ActionForm
                action={rejectPublicQueueGuestAction}
                values={{ sessionId: snapshot.id, participantId: participant.id }}
                label="Reject"
                tone="danger"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatMinutesClock(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Finished matches, newest first, numbered in the order they ended. Staff can
// correct a result that was tapped for the wrong team.
function MatchLog({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const completed = snapshot.games
    .filter((game) => game.status === "COMPLETED" && game.winningTeam)
    .sort((left, right) =>
      Date.parse(left.completedAt ?? "") - Date.parse(right.completedAt ?? "") ||
      left.sequence - right.sequence
    );
  if (completed.length === 0) return null;
  const durations = completed.flatMap((game) =>
    game.startedAt && game.completedAt
      ? [Date.parse(game.completedAt) - Date.parse(game.startedAt)]
      : []
  );
  const average = durations.length
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : null;
  const names = (game: Game, team: number) =>
    game.players
      .filter((player) => player.team === team)
      .sort((left, right) => left.slot - right.slot)
      .map((player) => player.displayName)
      .join(" & ") || "—";
  const rows = completed.map((game, index) => ({ game, number: index + 1 })).reverse();
  return (
    // Collapsed by default so the queue stays in view; staff open it to
    // check or correct a result.
    <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-4 bg-slate-50 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="text-sm font-black text-navy">
          Match log <span className="font-bold text-slate-400">({completed.length})</span>
        </h2>
        {average !== null ? (
          <span className="text-xs font-semibold text-slate-500">Avg game: {formatMinutesClock(average)}</span>
        ) : null}
        <span aria-hidden="true" className="ml-auto text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              <th className="w-12 px-4 py-2"><span className="sr-only">Match</span></th>
              <th className="px-2 py-2">Court</th>
              <th className="px-2 py-2">Win</th>
              <th className="px-2 py-2">Lose</th>
              <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ game, number }) => {
              const winner = game.winningTeam ?? 1;
              return (
                <tr key={game.id}>
                  <td className="px-4 py-2.5 text-xs font-bold text-slate-400">#{number}</td>
                  <td className="px-2 py-2.5 text-xs font-semibold text-slate-600">{game.courtName ?? "—"}</td>
                  <td className="px-2 py-2.5 font-black text-navy">
                    <span aria-hidden="true" className="mr-1.5 text-emerald-600">✓</span>
                    {names(game, winner)}
                  </td>
                  <td className="px-2 py-2.5 text-slate-500">{names(game, winner === 1 ? 2 : 1)}</td>
                  <td className="px-4 py-2 text-right">
                    {snapshot.status === "ACTIVE" ? (
                      <ActionForm
                        action={swapOpenPlayWinnerAction}
                        values={{ sessionId: snapshot.id, gameId: game.id }}
                        label="Swap winner"
                        tone="quiet"
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function QueueTab({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [details, setDetails] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeDetails = useCallback(() => setDetails(null), []);
  const closeAdding = useCallback(() => setAdding(false), []);
  const hasLeft = snapshot.participants.some((participant) => LEFT_STATUSES.includes(participant.status));
  return (
    <div className="space-y-4">
      <RequestsPanel snapshot={snapshot} onOpen={setDetails} />
      {/* Queue and Left sit side by side; Queue takes the full width when
          nobody has left. */}
      <div className={`grid items-start gap-4 ${hasLeft ? "lg:grid-cols-2" : ""}`}>
        <QueuePanel snapshot={snapshot} onOpen={setDetails} onAdd={() => setAdding(true)} />
        <LeftPanel snapshot={snapshot} onOpen={setDetails} />
      </div>
      <MatchLog snapshot={snapshot} />
      {details ? (
        <PlayerDetailsDialog
          key={details}
          snapshot={snapshot}
          participantId={details}
          onClose={closeDetails}
        />
      ) : null}
      {adding ? <AddPlayersDialog snapshot={snapshot} onClose={closeAdding} /> : null}
    </div>
  );
}

function MatchControls({
  snapshot,
  view,
}: {
  snapshot: OpenPlaySnapshot;
  view: "courts" | "up-next";
}) {
  const [picking, setPicking] = useState<SlotTarget | null>(null);
  const [acting, setActing] = useState<MatchPlayerTarget | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const closePicking = useCallback(() => setPicking(null), []);
  const closeActing = useCallback(() => setActing(null), []);
  const closeEditing = useCallback(() => setEditing(null), []);
  const choose =
    (gameId: string, slot: number, context: string) => (openedAt: number) =>
      setPicking({ gameId, slot, context, openedAt });
  const courtGames = snapshot.games.filter(
    (game) =>
      game.courtId && ["STAGED", "ACTIVE"].includes(game.status)
  );
  const activeGames = courtGames.filter((game) => game.status === "ACTIVE");
  const upNext = snapshot.games
    .filter((game) => game.status === "STAGED" && !game.courtId)
    .sort((left, right) => left.sequence - right.sequence);
  const freeCourts = snapshot.courts.filter(
    (court) =>
      court.active && !courtGames.some((game) => game.courtId === court.id)
  );
  // One box per Up next slot; hand-picked matches can briefly outnumber them.
  const upNextBoxes = Array.from(
    { length: Math.max(snapshot.upNextSlots, upNext.length) },
    (_, index) => upNext[index] ?? null
  );
  const canAddUpNext = snapshot.upNextSlots < OPEN_PLAY_MAX_UP_NEXT_SLOTS;
  const latestResult = snapshot.games
    .filter((game) => game.status === "COMPLETED" && game.completedAt)
    .sort(
      (left, right) =>
        new Date(right.completedAt!).getTime() -
        new Date(left.completedAt!).getTime()
    )[0];
  const latest = latestResult && !activeGames.some(
    (active) => active.courtId === latestResult.courtId
  ) ? latestResult : undefined;

  return (
    <div className="space-y-6">
      {view === "courts" ? <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-navy">Courts <span className="font-bold text-slate-400">({snapshot.courts.length})</span></h2>
          <div className="flex flex-wrap items-start gap-2">
            {latest ? <ActionForm action={undoOpenPlayResultAction} values={{ sessionId: snapshot.id, gameId: latest.id }} label="Undo latest result" tone="quiet" /> : null}
            <AddCourtControl snapshot={snapshot} />
          </div>
        </div>
        <div className={`grid gap-3 ${openPlayThreeColumnGridClass(snapshot.courts.length)}`}>
          {snapshot.courts.map((court) => {
            const game = courtGames.find((item) => item.courtId === court.id);
            const live = game?.status === "ACTIVE";
            const staged = game?.status === "STAGED";
            const palette = game ? liveMatchPalette(game.id) : null;
            return (
              <article
                key={court.id}
                className={`overflow-hidden rounded-2xl border shadow-sm ${live ? liveCourtCardClassName : staged ? "border-violet-200 bg-white" : "border-slate-200 bg-white"}`}
              >
                <div className={`flex items-center justify-between gap-2 border-b px-4 py-2 ${live ? liveCourtHeaderClassName : "border-slate-200 bg-slate-50/80"}`}>
                  <h3 className="min-w-0 truncate text-sm font-black text-navy">{court.name}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    {live && game?.startedAt ? <MatchTimer startedAt={game.startedAt} /> : null}
                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${live ? "text-emerald-700" : staged ? "text-violet-700" : "text-slate-500"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : staged ? "bg-violet-500" : court.active ? "bg-slate-300" : "bg-amber-400"}`} />
                      {!court.active ? "Paused" : live ? "Playing" : staged ? "Up next" : "Ready"}
                    </span>
                    {!live && snapshot.courts.length > 1 ? (
                      <IconActionForm
                        action={removeOpenPlayCourtAction}
                        values={{ sessionId: snapshot.id, courtId: court.id }}
                        label={`Remove ${court.name}`}
                        confirm={`Remove ${court.name} from this run?${staged ? " Its waiting match moves back to Up next." : ""}`}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="p-3">
                  {game && palette ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-2">
                      {[1, 2].map((team, index) => (
                        <div key={team} className="contents">
                          {index === 1 ? <span className="text-[10px] font-black text-slate-400">VS</span> : null}
                          <div className={`overflow-hidden rounded-xl border ${team === 1 ? palette.team1Panel : palette.team2Panel}`}>
                            <p className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${team === 1 ? palette.team1Accent : palette.team2Accent}`}>Team {team}</p>
                            <div className="space-y-1 px-3 py-2.5">
                              {teamSlots(game, team).map(({ slot, player }) => player ? (
                                <div key={slot} className="flex min-w-0 items-center gap-1">
                                  <PlayerNameButton
                                    name={player.displayName}
                                    onClick={() => setActing({ gameId: game.id, participantId: player.participantId, context: court.name })}
                                  />
                                  <ReturnToQueueForm
                                    snapshot={snapshot}
                                    participantId={player.participantId}
                                    displayName={player.displayName}
                                  />
                                </div>
                              ) : (
                                <OpenSlotButton key={slot} onChoose={choose(game.id, slot, court.name)} />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="py-4 text-center text-xs text-slate-500">{court.active ? "Ready for the next match." : "Rotation paused for this court."}</p>}
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] gap-2">
                    {/* Courts paused before courts could be removed can still resume. */}
                    {!game && !court.active ? <ActionForm className="col-span-3" action={toggleOpenPlayCourtAction} values={{ sessionId: snapshot.id, courtId: court.id, active: true }} label="Resume court" tone="quiet" /> : null}
                    {live && game && game.players.length < 4 ? <p className="col-span-3 flex min-h-9 items-center justify-center rounded-lg bg-amber-50 px-3 text-center text-xs font-bold text-amber-800">Fill the open spot to record a result.</p> : null}
                    {live && game && palette && game.players.length === 4 ? <>
                      <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 1 }} label="Team 1 wins" buttonClassName={`w-full ${palette.team1Button}`} />
                      <span aria-hidden />
                      <ActionForm action={recordOpenPlayWinnerAction} values={{ sessionId: snapshot.id, gameId: game.id, winningTeam: 2 }} label="Team 2 wins" buttonClassName={`w-full ${palette.team2Button}`} />
                    </> : null}
                    {staged && game && game.players.length === 4 ? <ActionForm className="col-span-3" action={startOpenPlayMatchAction} values={{ sessionId: snapshot.id, gameId: game.id }} label="Start match" buttonClassName="w-full bg-primary text-white hover:bg-primary-hover" /> : null}
                    {staged && game && game.players.length < 4 ? <p className="col-span-3 flex min-h-9 items-center justify-center rounded-lg bg-amber-50 px-3 text-center text-xs font-bold text-amber-800">Fill the open spot to start this match.</p> : null}
                    {staged && game ? (
                      <ReplaceStagedCourtMatchForm
                        snapshot={snapshot}
                        courtGameId={game.id}
                        upNext={upNext}
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section> : null}

      {view === "up-next" ? <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-navy">Up next <span className="font-bold text-slate-400">({upNext.length})</span></h2>
            <p className="mt-1 text-xs text-slate-500">{upNext.filter((game) => game.players.length === 4).length}/{snapshot.upNextSlots} ready · matchups wait here for a free court.</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {upNext.some((game) => game.selectionMethod === "AUTOMATIC") ? (
              <ActionForm action={refreshOpenPlayUpNextAction} values={{ sessionId: snapshot.id }} label="↻ Refresh Up next" tone="quiet" />
            ) : null}
            {canAddUpNext ? (
              <ActionForm action={addOpenPlayUpNextSlotAction} values={{ sessionId: snapshot.id }} label="+ Add match" tone="quiet" />
            ) : null}
          </div>
        </div>
        <div className={`grid gap-3 ${openPlayThreeColumnGridClass(upNextBoxes.length)}`}>
          {upNextBoxes.map((game, index) => game ? (
            <article key={game.id} className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm ring-1 ring-violet-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="text-xs font-black text-navy">Up next {index + 1}</p>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase text-violet-700">{game.selectionMethod === "AUTOMATIC" ? "Auto" : "Manual"}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{OPEN_PLAY_MODE_LABELS[game.matchingMode]}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ActionForm action={rebuildOpenPlayUpNextMatchAction} values={{ sessionId: snapshot.id, gameId: game.id }} label="↻ Rebuild" buttonClassName="min-h-7 rounded-md px-2 text-[11px] text-slate-600 hover:bg-slate-100" />
                  {index > 0 ? (
                    <IconActionForm
                      action={removeOpenPlayUpNextSlotAction}
                      values={{ sessionId: snapshot.id, gameId: game.id }}
                      label={`Remove Up next ${index + 1}`}
                      confirm={`Remove Up next ${index + 1}? Its players go back to their spots in the queue.`}
                    />
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {[1, 2].map((team, teamIndex) => (
                  <div key={team} className="contents">
                    {teamIndex === 1 ? <span className="text-[10px] font-black text-slate-300">VS</span> : null}
                    <div className={`rounded-lg border p-2 text-center ${team === 1 ? "border-indigo-200 bg-indigo-50" : "border-rose-200 bg-rose-50"}`}>
                      {teamSlots(game, team).map(({ slot, player }) => player ? (
                        <div key={slot} className="flex min-w-0 items-center gap-1 text-left">
                          <PlayerNameButton
                            name={player.displayName}
                            onClick={() => setActing({ gameId: game.id, participantId: player.participantId, context: `Up next ${index + 1}` })}
                          />
                          <ReturnToQueueForm
                            snapshot={snapshot}
                            participantId={player.participantId}
                            displayName={player.displayName}
                          />
                        </div>
                      ) : (
                        <OpenSlotButton key={slot} onChoose={choose(game.id, slot, `Up next ${index + 1}`)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <DispatchUpNextForm snapshot={snapshot} gameId={game.id} freeCourts={freeCourts} />
            </article>
          ) : (
            <article key={`empty-${index}`} className="flex min-h-36 flex-col rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-400">Up next {index + 1}</p>
                {index > 0 ? (
                  <IconActionForm
                    action={removeOpenPlayUpNextSlotAction}
                    values={{ sessionId: snapshot.id, expectedSlots: snapshot.upNextSlots }}
                    label={`Remove Up next ${index + 1}`}
                  />
                ) : null}
              </div>
              <p className="m-auto py-4 text-center text-sm text-slate-400">Not enough players waiting yet.</p>
            </article>
          ))}
        </div>
      </section> : null}
      {picking ? (
        <ChoosePlayerDialog
          key={`${picking.gameId}:${picking.slot}`}
          snapshot={snapshot}
          target={picking}
          onClose={closePicking}
        />
      ) : null}
      {acting ? (
        <MatchPlayerDialog
          key={`${acting.gameId}:${acting.participantId}`}
          snapshot={snapshot}
          target={acting}
          onClose={closeActing}
          onReplace={(slot, displayName) => {
            setActing(null);
            setPicking({
              gameId: acting.gameId,
              slot,
              context: acting.context,
              openedAt: Date.now(),
              replace: { participantId: acting.participantId, displayName },
            });
          }}
          onEdit={() => {
            setActing(null);
            setEditing(acting.participantId);
          }}
        />
      ) : null}
      {editing ? (
        <PlayerDetailsDialog
          key={editing}
          snapshot={snapshot}
          participantId={editing}
          onClose={closeEditing}
        />
      ) : null}
    </div>
  );
}

export type OpenPlayConsoleHeader = {
  publicUrl: string;
  qrSvg: string;
  // Venue, event date, or kind of queue, shown under the title.
  subtitle: string;
  notice?: string;
  history?: Array<{
    id: string;
    runNumber: number;
    status: string;
    players: number;
    matches: number;
  }>;
};

function SettingsDialog({
  snapshot,
  history,
  onClose,
}: {
  snapshot: OpenPlaySnapshot;
  history: OpenPlayConsoleHeader["history"];
  onClose: () => void;
}) {
  const pairingAvailable = PAIRING_MODES.includes(snapshot.matchingMode);
  return (
    <Modal labelledBy="bunalq-settings-title" onClose={onClose} className="max-w-3xl">
      <ModalTitle id="bunalq-settings-title" title="Run settings" onClose={onClose}>
        <p className="mt-1 text-sm text-slate-500">Run {snapshot.runNumber} · {OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]}</p>
      </ModalTitle>
      <div className="mt-5 space-y-4">
        {snapshot.status !== "ENDED" ? <ModeForm snapshot={snapshot} /> : null}
        {snapshot.status !== "ENDED" && pairingAvailable ? <PairForm snapshot={snapshot} /> : null}
        {pairingAvailable ? <SavedPairs snapshot={snapshot} /> : null}
        {snapshot.status !== "ENDED" && snapshot.queue.kind === "EVENT" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Event roster</h3>
              <p className="mt-1 text-xs text-slate-500">Pull in new registrations and updates from the Event.</p>
            </div>
            <ActionForm action={syncOpenPlayRosterAction} values={{ sessionId: snapshot.id }} label="Refresh roster" tone="quiet" />
          </div>
        ) : null}
        {history && history.length > 1 ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-navy">Run history</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {history.map((run) => (
                <div key={run.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-navy">Run {run.runNumber}</p>
                    <span className="text-[10px] font-black text-slate-500">{run.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{run.players} players · {run.matches} matches</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function QrDialog({
  header,
  onClose,
}: {
  header: OpenPlayConsoleHeader;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="bunalq-qr-title" onClose={onClose} className="max-w-sm">
      <ModalTitle id="bunalq-qr-title" title="Share this BunalQ" onClose={onClose} />
      <div
        className="mx-auto mt-4 aspect-square w-full max-w-64 overflow-hidden rounded-2xl border border-slate-200"
        dangerouslySetInnerHTML={{ __html: header.qrSvg }}
      />
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">
        Players can follow the courts, Up next, and the queue.
      </p>
      <a href={header.publicUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-center text-xs font-bold text-primary">
        {header.publicUrl}
      </a>
    </Modal>
  );
}

function ConsoleHeader({
  snapshot,
  canManage,
  header,
}: {
  snapshot: OpenPlaySnapshot;
  canManage: boolean;
  header: OpenPlayConsoleHeader;
}) {
  const [dialog, setDialog] = useState<"qr" | "settings" | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const headerButton = "inline-flex min-h-9 items-center rounded-lg border border-white/15 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/20";
  return (
    <header className="rounded-2xl bg-navy px-4 py-3 text-white shadow-sm sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="min-w-0 truncate text-xl font-black tracking-tight sm:text-2xl">{snapshot.queue.title}</h1>
            <OpenPlayCounts snapshot={snapshot} />
          </div>
          <p className="mt-1 truncate text-xs text-white/50">
            Run {snapshot.runNumber} · {snapshot.status === "ACTIVE" ? "Live" : snapshot.status === "SETUP" ? "Not started" : "Ended"} · {OPEN_PLAY_MODE_LABELS[snapshot.matchingMode]} · {header.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <CopyLiveLinkButton url={header.publicUrl} className={headerButton} />
          <Link href={`/q/${snapshot.queue.publicId}`} target="_blank" className={headerButton}>
            Player board ↗
          </Link>
          <button type="button" onClick={() => setDialog("qr")} className={headerButton}>QR</button>
          {canManage ? (
            <button type="button" onClick={() => setDialog("settings")} className={headerButton}>Settings</button>
          ) : null}
          {canManage && snapshot.status === "SETUP" ? (
            <ActionForm action={startOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="Start run" />
          ) : null}
          {canManage && snapshot.status !== "ENDED" ? (
            <ActionForm action={endOpenPlaySessionAction} values={{ sessionId: snapshot.id }} label="End" buttonClassName="bg-red-600 px-4 text-white hover:bg-red-700" confirm="End this run? Staged and active matches will be cancelled." />
          ) : null}
          {canManage && snapshot.status === "ENDED" ? (
            <ActionForm action={startNewOpenPlayRunAction} values={{ sessionId: snapshot.id }} label="Start new run" confirm="Create a fresh run and reset copied players to not checked in?" />
          ) : null}
        </div>
      </div>
      {dialog === "qr" ? <QrDialog header={header} onClose={closeDialog} /> : null}
      {dialog === "settings" ? <SettingsDialog snapshot={snapshot} history={header.history} onClose={closeDialog} /> : null}
    </header>
  );
}

const CONSOLE_SECTIONS = ["courts", "up-next", "queue"] as const;
type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

// Courts, Up next, and Queue all stay on the page; the bar above them jumps
// to a section and highlights whichever one is being looked at.
function ConsoleSections({ snapshot }: { snapshot: OpenPlaySnapshot }) {
  const [active, setActive] = useState<ConsoleSection>("courts");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id as ConsoleSection);
      },
      { rootMargin: "-25% 0px -65% 0px" }
    );
    CONSOLE_SECTIONS.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);
  const counts: Record<ConsoleSection, number> = {
    courts: snapshot.courts.length,
    "up-next": snapshot.games.filter((game) => game.status === "STAGED" && !game.courtId).length,
    queue: snapshot.participants.filter((participant) => participant.status === "QUEUED").length,
  };
  const labels: Record<ConsoleSection, string> = { courts: "Courts", "up-next": "Up next", queue: "Queue" };
  const notStarted = (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      Start the run to prepare matchups automatically.
    </p>
  );
  return (
    <div>
      <nav aria-label="BunalQ sections" className="mb-5 grid grid-cols-3 border-b border-slate-200">
        {CONSOLE_SECTIONS.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active === id ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setActive(id);
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.history.replaceState(null, "", `#${id}`);
            }}
            className={`-mb-px flex min-h-12 items-center justify-center border-b-2 px-2 text-sm font-black transition ${
              active === id
                ? "border-navy bg-white text-navy"
                : "border-transparent text-slate-500 hover:text-navy"
            }`}
          >
            {labels[id]}&nbsp;<span className="font-bold text-slate-400">({counts[id]})</span>
          </a>
        ))}
      </nav>
      <div className="space-y-10">
        <section id="courts" className="scroll-mt-24">
          {snapshot.status === "ACTIVE" ? <MatchControls snapshot={snapshot} view="courts" /> : notStarted}
        </section>
        <section id="up-next" className="scroll-mt-24">
          {snapshot.status === "ACTIVE" ? <MatchControls snapshot={snapshot} view="up-next" /> : null}
        </section>
        <section id="queue" className="scroll-mt-24">
          <QueueTab snapshot={snapshot} />
        </section>
      </div>
    </div>
  );
}

export function OpenPlayConsole({
  snapshot,
  canManage,
  header,
}: {
  snapshot: OpenPlaySnapshot;
  canManage: boolean;
  header: OpenPlayConsoleHeader;
}) {
  return (
    <div className="space-y-5">
      <OpenPlayLiveRefresh publicId={snapshot.queue.publicId} />
      <ConsoleHeader snapshot={snapshot} canManage={canManage} header={header} />
      {header.notice ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{header.notice}</p>
      ) : null}
      {/* Organizers open the public board from the header; staff who can
          only view get the board inline, since it is all they can use. */}
      {canManage ? (
        snapshot.status === "ENDED" ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            This run is archived. Its results stay on the player board. Start a new run from the header.
          </p>
        ) : (
          <ConsoleSections snapshot={snapshot} />
        )
      ) : (
        <OpenPlayBoard snapshot={snapshot} />
      )}
    </div>
  );
}
