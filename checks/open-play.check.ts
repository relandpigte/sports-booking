// Partner-only live Open Play queue, deterministic matching, and result safety.
//
//   npm run check:open-play
import { Prisma, PrismaClient } from "@prisma/client";

import { deleteFixtureUsers, ok, run, stubRequestContext } from "./harness";
import { manilaInstant, manilaToday } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-open-play-partner@example.test";
const PLAYER_EMAILS = Array.from(
  { length: 8 },
  (_, index) => `check-open-play-player-${index + 1}@example.test`
);

function sameTeam(
  match: Array<{ participantId: string; team: number }> | null,
  firstId: string,
  secondId: string
) {
  const first = match?.find((slot) => slot.participantId === firstId);
  const second = match?.find((slot) => slot.participantId === secondId);
  return Boolean(first && second && first.team === second.team);
}

function selectedIds(
  match: Array<{ participantId: string }> | null
): string[] {
  return match?.map((slot) => slot.participantId).sort() ?? [];
}

async function cleanup() {
  await prisma.openPlayQueue.deleteMany({
    where: { hub: { owner: { isGuestBunalQOrganizer: true } } },
  });
  await prisma.user.deleteMany({ where: { isGuestBunalQOrganizer: true } });
  await prisma.openPlayQueue.deleteMany({
    where: { hub: { owner: { email: PARTNER_EMAIL } } },
  });
  await deleteFixtureUsers(prisma, {
    email: { in: [PARTNER_EMAIL, ...PLAYER_EMAILS] },
  });
}

async function check() {
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      email: PARTNER_EMAIL,
      name: "Open Play Partner",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, email: true, role: true, partnerStatus: true },
  });
  const players = await Promise.all(
    PLAYER_EMAILS.map((email, index) =>
      prisma.user.create({
        data: {
          email,
          name: `Queue Player ${index + 1}`,
          playerName: `P${index + 1}`,
          role: "PLAYER",
          skillLevel: index < 4 ? "advanced" : "beginner",
          privateProfile: index === 0,
        },
        select: { id: true },
      })
    )
  );
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Open Play Check Hub",
      coverPhotos: [],
      games: ["pickleball"],
      courts: {
        create: [
          { name: "Court 1", sport: "pickleball" },
          { name: "Court 2", sport: "pickleball" },
        ],
      },
    },
    select: { id: true, courts: { orderBy: { createdAt: "asc" }, select: { id: true } } },
  });
  const date = manilaToday();
  const event = await prisma.event.create({
    data: {
      publicId: `open-play-check-${partner.id}`,
      hubId: hub.id,
      title: "Check Open Play",
      sport: "pickleball",
      date,
      startHour: 6,
      endHour: 23,
      startsAt: manilaInstant(date, 6),
      endsAt: manilaInstant(date, 23),
      capacity: 12,
      registrationFee: 0,
      status: "PUBLISHED",
      publishedAt: new Date(),
      courts: { create: hub.courts.map((court) => ({ courtId: court.id })) },
      registrations: {
        create: players.map((player) => ({
          userId: player.id,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        })),
      },
      organizerGuests: {
        create: {
          createdById: partner.id,
          name: "Organizer Guest",
          status: "CONFIRMED",
        },
      },
    },
    select: { id: true, publicId: true },
  });

  const requestContext = stubRequestContext(partner, { stubPublicRequest: true });
  const actions = await import("@/lib/open-play-actions");
  const domain = await import("@/lib/open-play");
  const maintenance = await import("@/lib/open-play-maintenance");

  const prepare = new FormData();
  prepare.set("publicId", event.publicId);
  const prepared = await actions.prepareOpenPlayAction({}, prepare);
  ok("an active partner can prepare an Event queue", Boolean(prepared.success));
  const session = await prisma.openPlaySession.findFirstOrThrow({
    where: { queue: { eventId: event.id } },
    include: { participants: { orderBy: { createdAt: "asc" } }, courts: true },
  });
  ok("confirmed registrations and organizer guests seed the roster", session.participants.length === 9);
  ok("private profiles use a non-identifying queue name", session.participants.some((row) => row.displayName === "Private player"));
  ok("every Event court is enabled for rotation", session.courts.length === 2 && session.courts.every((court) => court.active));
  ok("a prepared run keeps one Up next box per court", session.upNextSlots === 2);

  const duplicatePrepare = await actions.prepareOpenPlayAction({}, prepare);
  ok(
    "preparation is idempotent",
    Boolean(duplicatePrepare.success) &&
      (await prisma.openPlaySession.count({ where: { queue: { eventId: event.id } } })) === 1
  );

  const bulkCheckIn = new FormData();
  bulkCheckIn.set("sessionId", session.id);
  session.participants.slice(0, 8).forEach((participant) => bulkCheckIn.append("participantId", participant.id));
  ok("staff can bulk check in eligible players", Boolean((await actions.bulkCheckInOpenPlayParticipantsAction({}, bulkCheckIn)).success));
  const checkedIn = await prisma.openPlayParticipant.findMany({ where: { sessionId: session.id, status: "QUEUED" } });
  ok("bulk check-in assigns unique queue positions", new Set(checkedIn.map((player) => player.queuePosition)).size === 8);
  const bulkPause = new FormData();
  bulkPause.set("sessionId", session.id);
  checkedIn.slice(0, 2).forEach((participant) => bulkPause.append("participantId", participant.id));
  bulkPause.append("participantId", session.participants[8].id);
  const paused = await actions.bulkPauseOpenPlayParticipantsAction({}, bulkPause);
  ok(
    "staff can bulk-break only selected waiting players",
    paused.success?.includes("2 players") === true &&
      (await prisma.openPlayParticipant.count({
        where: {
          id: { in: checkedIn.slice(0, 2).map((participant) => participant.id) },
          status: "PAUSED",
          queuePosition: null,
          queuedAt: null,
        },
      })) === 2 &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: session.participants[8].id },
      })).status === "NOT_CHECKED_IN"
  );
  for (const participant of checkedIn.slice(0, 2)) {
    const resume = new FormData();
    resume.set("sessionId", session.id);
    resume.set("participantId", participant.id);
    await actions.resumeOpenPlayParticipantAction({}, resume);
  }
  const start = new FormData();
  start.set("sessionId", session.id);
  ok("the queue starts on the Event's Manila date", Boolean((await actions.startOpenPlaySessionAction({}, start)).success));

  let stagedGames = await prisma.openPlayGame.findMany({
    where: { sessionId: session.id, status: "STAGED" },
    orderBy: { sequence: "asc" },
    include: { players: { orderBy: { slot: "asc" } } },
  });
  ok(
    "starting a run automatically stages one matchup on each available court",
    stagedGames.length === 2 &&
      stagedGames.every((game) => game.courtId && game.players.length === 4) &&
      new Set(stagedGames.map((game) => game.courtId)).size === 2 &&
      new Set(
        stagedGames.flatMap((game) =>
          game.players.map((slot) => slot.participantId)
        )
      ).size === 8
  );

  const manualGame = stagedGames[1];
  const editUpcoming = new FormData();
  editUpcoming.set("sessionId", session.id);
  editUpcoming.set("gameId", manualGame.id);
  const manualOrder = [
    manualGame.players[0],
    manualGame.players[2],
    manualGame.players[1],
    manualGame.players[3],
  ];
  manualOrder.forEach((player, index) =>
    editUpcoming.set(`player${index + 1}`, player.participantId)
  );
  ok(
    "an operator can edit an automatically prepared matchup",
    Boolean(
      (await actions.editStagedOpenPlayMatchAction({}, editUpcoming)).success
    )
  );
  const changeMode = new FormData();
  changeMode.set("sessionId", session.id);
  changeMode.set("mode", "ROUND_ROBIN");
  ok(
    "changing to Round Robin refreshes automatic matchups",
    Boolean((await actions.changeOpenPlayModeAction({}, changeMode)).success)
  );
  ok(
    "mode refresh preserves manually edited upcoming matchups",
    (await prisma.openPlayGame.findUniqueOrThrow({
      where: { id: manualGame.id },
    })).status === "STAGED"
  );

  let automaticGame = await prisma.openPlayGame.findFirstOrThrow({
    where: {
      sessionId: session.id,
      status: "STAGED",
      selectionMethod: "AUTOMATIC",
    },
    include: { players: true },
  });
  ok(
    "Round Robin is stored on regenerated automatic matchups",
    automaticGame.matchingMode === "ROUND_ROBIN"
  );

  const pauseSecondCourt = new FormData();
  pauseSecondCourt.set("sessionId", session.id);
  pauseSecondCourt.set("courtId", hub.courts[1].id);
  pauseSecondCourt.set("active", "false");
  ok(
    "pausing a free court preserves the staged matchup in the Up next buffer",
    Boolean(
      (await actions.toggleOpenPlayCourtAction({}, pauseSecondCourt)).success
    ) &&
      (await prisma.openPlayGame.count({
        where: { sessionId: session.id, status: "STAGED" },
      })) === 2 &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: manualGame.id },
      })).status === "STAGED" &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: manualGame.id },
      })).courtId === null
  );
  const resumeSecondCourt = new FormData();
  resumeSecondCourt.set("sessionId", session.id);
  resumeSecondCourt.set("courtId", hub.courts[1].id);
  resumeSecondCourt.set("active", "true");
  ok(
    "resuming a court automatically restores upcoming capacity",
    Boolean(
      (await actions.toggleOpenPlayCourtAction({}, resumeSecondCourt)).success
    ) &&
      (await prisma.openPlayGame.count({
        where: { sessionId: session.id, status: "STAGED" },
      })) === 2
  );
  automaticGame = await prisma.openPlayGame.findFirstOrThrow({
    where: {
      sessionId: session.id,
      status: "STAGED",
      selectionMethod: "AUTOMATIC",
    },
    include: { players: true },
  });

  const checkInNinth = new FormData();
  checkInNinth.set("sessionId", session.id);
  checkInNinth.set("participantId", session.participants[8].id);
  await actions.checkInOpenPlayParticipantAction({}, checkInNinth);

  const openSlot = automaticGame.players[0];
  const stagedPlayerId = openSlot.participantId;
  const cancelledBeforeSitOut = await prisma.openPlayGame.count({
    where: { sessionId: session.id, status: "CANCELLED" },
  });
  const sitOut = (participantId: string) => {
    const form = new FormData();
    form.set("sessionId", session.id);
    form.set("participantId", participantId);
    return actions.pauseOpenPlayParticipantAction({}, form);
  };
  const rejoin = (participantId: string) => {
    const form = new FormData();
    form.set("sessionId", session.id);
    form.set("participantId", participantId);
    return actions.resumeOpenPlayParticipantAction({}, form);
  };
  const fillSlot = (slot: number, participantId?: string) => {
    const form = new FormData();
    form.set("sessionId", session.id);
    form.set("gameId", automaticGame.id);
    form.set("slot", String(slot));
    form.set("pick", participantId ? "manual" : "auto");
    if (participantId) form.set("participantId", participantId);
    return actions.fillOpenPlaySlotAction({}, form);
  };
  const sitOutResult = await sitOut(stagedPlayerId);
  const gameAfterSitOut = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: automaticGame.id },
    include: { players: true },
  });
  ok(
    "staff can sit out a player from Up next",
    sitOutResult.success?.includes("open spot") === true &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: stagedPlayerId },
      })).status === "PAUSED"
  );
  ok(
    "sitting out keeps the announced match and opens only that spot",
    gameAfterSitOut.status === "STAGED" &&
      gameAfterSitOut.courtId === automaticGame.courtId &&
      gameAfterSitOut.players.length === 3 &&
      gameAfterSitOut.players.every(
        (slot) =>
          slot.participantId !== stagedPlayerId &&
          automaticGame.players.some(
            (before) =>
              before.participantId === slot.participantId &&
              before.slot === slot.slot
          )
      ) &&
      (await prisma.openPlayGame.count({
        where: { sessionId: session.id, status: "CANCELLED" },
      })) === cancelledBeforeSitOut &&
      (await prisma.openPlayGame.count({
        where: { sessionId: session.id, status: "STAGED" },
      })) === 2
  );

  const startIncomplete = new FormData();
  startIncomplete.set("sessionId", session.id);
  startIncomplete.set("gameId", automaticGame.id);
  ok(
    "a match with an open spot cannot start",
    (await actions.startOpenPlayMatchAction({}, startIncomplete)).message?.includes(
      "open spot"
    ) === true &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: automaticGame.id },
      })).status === "STAGED"
  );
  ok(
    "a player on break cannot be picked into an open spot",
    Boolean((await fillSlot(openSlot.slot, stagedPlayerId)).message) &&
      (await prisma.openPlayGamePlayer.count({
        where: { gameId: automaticGame.id },
      })) === 3
  );

  const queuedBeforeFill = await prisma.openPlayParticipant.findMany({
    where: { sessionId: session.id, status: "QUEUED" },
    select: { id: true, queuePosition: true },
  });
  const autoPickResults = await Promise.all([
    fillSlot(openSlot.slot),
    fillSlot(openSlot.slot),
  ]);
  const autoPicked = await prisma.openPlayGamePlayer.findFirstOrThrow({
    where: { gameId: automaticGame.id, slot: openSlot.slot },
    include: { participant: true, game: true },
  });
  ok(
    "auto-pick fills an open spot once under concurrent submissions",
    autoPickResults.filter((result) => result.success).length === 1 &&
      autoPickResults.filter((result) => result.message).length === 1 &&
      (await prisma.openPlayGamePlayer.count({
        where: { gameId: automaticGame.id },
      })) === 4
  );
  ok(
    "auto-pick seats a waiting player on the open spot's team",
    queuedBeforeFill.some(
      (row) =>
        row.id === autoPicked.participantId &&
        row.queuePosition === autoPicked.queuePositionBefore
    ) &&
      autoPicked.team === openSlot.team &&
      autoPicked.participant.status === "STAGED" &&
      autoPicked.participant.queuePosition === null &&
      autoPicked.game.selectionMethod === "AUTOMATIC"
  );

  await rejoin(stagedPlayerId);
  const handPickedSlot = gameAfterSitOut.players[0];
  await sitOut(handPickedSlot.participantId);
  const handPickResult = await fillSlot(handPickedSlot.slot, stagedPlayerId);
  const handPicked = await prisma.openPlayGamePlayer.findFirstOrThrow({
    where: { gameId: automaticGame.id, slot: handPickedSlot.slot },
    include: { participant: true, game: true },
  });
  ok(
    "staff can hand-pick a waiting player for an open spot",
    Boolean(handPickResult.success) &&
      handPicked.participantId === stagedPlayerId &&
      handPicked.team === handPickedSlot.team &&
      handPicked.participant.status === "STAGED" &&
      handPicked.game.selectionMethod === "MANUAL"
  );
  await rejoin(handPickedSlot.participantId);
  automaticGame = await prisma.openPlayGame.findFirstOrThrow({
    where: {
      id: automaticGame.id,
      sessionId: session.id,
      status: "STAGED",
    },
    include: { players: true },
  });

  const removableQueued = await prisma.openPlayParticipant.findFirstOrThrow({
    where: { sessionId: session.id, status: "QUEUED" },
    select: { id: true },
  });
  const protectedBulkRemove = new FormData();
  protectedBulkRemove.set("sessionId", session.id);
  protectedBulkRemove.append(
    "participantId",
    manualGame.players[0].participantId
  );
  protectedBulkRemove.append("participantId", removableQueued.id);
  const protectedRemoveResult = await actions.bulkRemoveOpenPlayParticipantsAction(
    {},
    protectedBulkRemove
  );
  ok(
    "bulk removal skips staged players and removes only eligible selections",
    protectedRemoveResult.success?.includes("1 player removed") === true &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: manualGame.players[0].participantId },
      })).status === "STAGED" &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: removableQueued.id },
      })).status === "REMOVED"
  );

  const automaticCourtId = automaticGame.courtId;
  const startGame = new FormData();
  startGame.set("sessionId", session.id);
  startGame.set("gameId", automaticGame.id);
  const startResults = await Promise.all([
    actions.startOpenPlayMatchAction({}, startGame),
    actions.startOpenPlayMatchAction({}, startGame),
  ]);
  ok("a staged court match starts once under concurrent submissions", startResults.filter((result) => result.success).length === 1);
  ok("a duplicate concurrent start is rejected", startResults.filter((result) => result.message).length === 1);
  ok(
    "starting preserves the automatically assigned court",
    (await prisma.openPlayGame.findUniqueOrThrow({
      where: { id: automaticGame.id },
    })).status === "ACTIVE" &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: automaticGame.id },
      })).courtId === automaticCourtId
  );

  const upNextForPairing = await prisma.openPlayGame.findFirstOrThrow({
    where: { sessionId: session.id, status: "STAGED" },
    orderBy: { sequence: "asc" },
    include: { players: true },
  });
  const pairDuringPlay = new FormData();
  pairDuringPlay.set("sessionId", session.id);
  pairDuringPlay.set("firstId", automaticGame.players[0].participantId);
  pairDuringPlay.set("secondId", upNextForPairing.players[0].participantId);
  const pairDuringPlayResult =
    await actions.pairOpenPlayParticipantsAction({}, pairDuringPlay);
  const assignedPairId = (
    await prisma.openPlayParticipant.findUniqueOrThrow({
      where: { id: automaticGame.players[0].participantId },
      select: { pairId: true },
    })
  ).pairId;
  ok(
    "staff can assign a fixed pair across Playing and Up Next",
    pairDuringPlayResult.success?.includes("kept unchanged") === true &&
      Boolean(assignedPairId) &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: upNextForPairing.players[0].participantId },
        select: { pairId: true },
      })).pairId === assignedPairId
  );
  ok(
    "pairing Playing and Up Next players preserves announced matchups",
    (await prisma.openPlayGame.findUniqueOrThrow({
      where: { id: automaticGame.id },
    })).status === "ACTIVE" &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: upNextForPairing.id },
      })).status === "STAGED"
  );
  const unpairDuringPlay = new FormData();
  unpairDuringPlay.set("sessionId", session.id);
  unpairDuringPlay.set("pairId", assignedPairId ?? "");
  const unpairDuringPlayResult =
    await actions.unpairOpenPlayParticipantsAction({}, unpairDuringPlay);
  ok(
    "removing a pair during play also preserves announced matchups",
    unpairDuringPlayResult.success?.includes("kept unchanged") === true &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: automaticGame.id },
      })).status === "ACTIVE" &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: upNextForPairing.id },
      })).status === "STAGED"
  );

  const winner = new FormData();
  winner.set("sessionId", session.id);
  winner.set("gameId", automaticGame.id);
  winner.set("winningTeam", "1");
  const winnerResults = await Promise.all([
    actions.recordOpenPlayWinnerAction({}, winner),
    actions.recordOpenPlayWinnerAction({}, winner),
  ]);
  ok("a winner returns all players to rotation", winnerResults.filter((result) => result.success).length === 1);
  ok("a duplicate concurrent result is rejected", winnerResults.filter((result) => result.message).length === 1);
  ok(
    "the result is counted exactly once",
    (await prisma.openPlayGame.count({ where: { id: automaticGame.id, status: "COMPLETED", winningTeam: 1 } })) === 1
  );
  ok(
    "finishing a match automatically stages the next matchup on the freed court",
    (await prisma.openPlayGame.count({
      where: {
        sessionId: session.id,
        status: "STAGED",
        courtId: automaticCourtId,
      },
    })) === 1
  );
  stagedGames = await prisma.openPlayGame.findMany({
    where: { sessionId: session.id, status: "STAGED" },
    include: { players: true },
  });
  ok(
    "recording a result automatically replenishes available upcoming capacity",
    stagedGames.length === 2 &&
      stagedGames.every((game) => game.courtId !== null)
  );

  const undo = new FormData();
  undo.set("sessionId", session.id);
  undo.set("gameId", automaticGame.id);
  ok(
    "undo restores the completed game before the staged successor starts",
    Boolean((await actions.undoOpenPlayResultAction({}, undo)).success) &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: automaticGame.id },
      })).status === "ACTIVE"
  );
  ok(
    "the restored game can be completed again",
    Boolean((await actions.recordOpenPlayWinnerAction({}, winner)).success)
  );

  const snapshot = await domain.getPublicOpenPlaySnapshot(event.publicId);
  const serialized = JSON.stringify(snapshot);
  ok("public snapshots expose the live queue", Boolean(snapshot?.participants.length));
  ok(
    "public snapshots expose upcoming matchups staged on courts",
    snapshot?.games.some(
      (game) => game.status === "STAGED" && game.courtId !== null
    ) === true
  );
  ok("public snapshots omit email, phone, and payment fields", !serialized.includes("@example.test") && !serialized.includes("phone") && !serialized.includes("payment"));
  ok(
    "active BunalQ rooms appear in the public directory",
    (await domain.listPublicBunalQQueues()).some(
      (queue) => queue.publicId === snapshot?.queue.publicId
    )
  );

  const bufferCourts = await Promise.all(
    ["Buffer Court 1", "Buffer Court 2"].map((name) =>
      prisma.court.create({
        data: { hubId: hub.id, name, sport: "pickleball" },
        select: { id: true },
      })
    )
  );
  const bufferSession = await prisma.openPlaySession.create({
    data: {
      queue: {
        create: {
          publicId: `buffer-${partner.id}`,
          hubId: hub.id,
          title: "Buffered Quick Queue",
          kind: "QUICK",
          admissionMode: "APPROVAL_REQUIRED",
          createdById: partner.id,
        },
      },
      status: "SETUP",
      matchingMode: "BALANCED",
      createdById: partner.id,
      courts: {
        create: bufferCourts.map((court, index) => ({
          courtId: court.id,
          position: index,
        })),
      },
      participants: {
        create: Array.from({ length: 16 }, (_, index) => ({
          source: "WALK_IN",
          displayName: `Buffer Player ${index + 1}`,
          skillLevel: index % 2 === 0 ? "advanced" : "beginner",
        })),
      },
    },
    include: { participants: true },
  });
  const checkInBuffer = new FormData();
  checkInBuffer.set("sessionId", bufferSession.id);
  bufferSession.participants.forEach((participant) =>
    checkInBuffer.append("participantId", participant.id)
  );
  await actions.bulkCheckInOpenPlayParticipantsAction({}, checkInBuffer);
  const startBuffer = new FormData();
  startBuffer.set("sessionId", bufferSession.id);
  await actions.startOpenPlaySessionAction({}, startBuffer);
  const bufferedGames = await prisma.openPlayGame.findMany({
    where: { sessionId: bufferSession.id, status: "STAGED" },
    orderBy: { sequence: "asc" },
  });
  ok(
    "BunalQ keeps its Up next boxes filled beyond staged court matchups",
    bufferedGames.length === 4 &&
      bufferedGames.filter((game) => game.courtId !== null).length === 2 &&
      bufferedGames.filter((game) => game.courtId === null).length === 2
  );

  const stagedCourtGame = bufferedGames.find((game) => game.courtId !== null)!;
  const bufferedReplacement = bufferedGames.find((game) => game.courtId === null)!;
  const originalCourtId = stagedCourtGame.courtId;
  const replaceCourtMatch = new FormData();
  replaceCourtMatch.set("sessionId", bufferSession.id);
  replaceCourtMatch.set("courtGameId", stagedCourtGame.id);
  replaceCourtMatch.set("replacementGameId", bufferedReplacement.id);
  const replaceResult = await actions.replaceStagedCourtMatchAction(
    {},
    replaceCourtMatch
  );
  ok(
    "staff can replace an unstarted court matchup with a buffered match",
    Boolean(replaceResult.success) &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: stagedCourtGame.id },
      })).courtId === null &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: bufferedReplacement.id },
      })).courtId === originalCourtId &&
      (await prisma.openPlayGame.count({
        where: {
          sessionId: bufferSession.id,
          status: "STAGED",
          courtId: null,
        },
      })) === 2
  );

  const startReplacement = new FormData();
  startReplacement.set("sessionId", bufferSession.id);
  startReplacement.set("gameId", bufferedReplacement.id);
  await actions.startOpenPlayMatchAction({}, startReplacement);
  ok(
    "starting a staged match keeps two additional matchups prepared",
    (await prisma.openPlayGame.count({
      where: {
        sessionId: bufferSession.id,
        status: "STAGED",
        courtId: null,
      },
    })) === 2
  );

  // Organizer controls: return to queue, Queue and Left, Up next boxes,
  // Rebuild, and adding or removing courts mid-run.
  const form = (values: Record<string, string | number>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(values)) data.set(name, String(value));
    return data;
  };
  const controlCourts = await Promise.all(
    ["Control Court 1", "Control Court 2", "Control Court 3", "Control Court 4"].map((name) =>
      prisma.court.create({
        data: { hubId: hub.id, name, sport: "pickleball" },
        select: { id: true },
      })
    )
  );
  const tennisCourt = await prisma.court.create({
    data: { hubId: hub.id, name: "Control Tennis Court", sport: "tennis" },
    select: { id: true },
  });
  const control = await prisma.openPlaySession.create({
    data: {
      queue: {
        create: {
          publicId: `control-${partner.id}`,
          hubId: hub.id,
          title: "Organizer Control Queue",
          kind: "QUICK",
          admissionMode: "APPROVAL_REQUIRED",
          createdById: partner.id,
        },
      },
      status: "SETUP",
      matchingMode: "BALANCED",
      createdById: partner.id,
      upNextSlots: 3,
      courts: {
        create: controlCourts.slice(0, 3).map((court, index) => ({
          courtId: court.id,
          position: index,
        })),
      },
      participants: {
        create: Array.from({ length: 28 }, (_, index) => ({
          source: "WALK_IN",
          displayName: `Control Player ${index + 1}`,
          skillLevel: index % 2 === 0 ? "advanced" : "beginner",
        })),
      },
    },
    include: { participants: true },
  });
  const controlCheckIn = new FormData();
  controlCheckIn.set("sessionId", control.id);
  control.participants.forEach((participant) =>
    controlCheckIn.append("participantId", participant.id)
  );
  await actions.bulkCheckInOpenPlayParticipantsAction({}, controlCheckIn);
  await actions.startOpenPlaySessionAction({}, form({ sessionId: control.id }));
  const openGames = () =>
    prisma.openPlayGame.findMany({
      where: { sessionId: control.id, status: { in: ["STAGED", "ACTIVE"] } },
      orderBy: { sequence: "asc" },
      include: { players: { orderBy: { slot: "asc" } } },
    });
  const controlSlots = async () =>
    (await prisma.openPlaySession.findUniqueOrThrow({ where: { id: control.id } }))
      .upNextSlots;
  const participantRow = (id: string) =>
    prisma.openPlayParticipant.findUniqueOrThrow({ where: { id } });
  const returnToQueue = (participantId: string) =>
    actions.returnOpenPlayParticipantToQueueAction(
      {},
      form({ sessionId: control.id, participantId })
    );
  let controlGames = await openGames();
  ok(
    "a run prepares one match per court plus one per Up next box",
    controlGames.filter((game) => game.courtId).length === 3 &&
      controlGames.filter((game) => !game.courtId).length === 3
  );

  const upNextBox = controlGames.find((game) => !game.courtId)!;
  const upNextLeaver = upNextBox.players[0];
  const upNextReturn = await returnToQueue(upNextLeaver.participantId);
  const upNextLeaverRow = await participantRow(upNextLeaver.participantId);
  const upNextBoxAfter = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: upNextBox.id },
    include: { players: true },
  });
  ok(
    "× on an Up next player puts them back at their earlier spot",
    upNextReturn.success?.includes("open spot") === true &&
      upNextLeaverRow.status === "QUEUED" &&
      upNextLeaverRow.queuePosition === upNextLeaver.queuePositionBefore
  );
  ok(
    "the Up next match keeps its other players with an open spot",
    upNextBoxAfter.status === "STAGED" && upNextBoxAfter.players.length === 3
  );
  ok(
    "only players in a match can be returned to the queue",
    domain.canTransitionParticipant("PLAYING", "RETURN_TO_QUEUE") &&
      domain.canTransitionParticipant("STAGED", "RETURN_TO_QUEUE") &&
      !domain.canTransitionParticipant("QUEUED", "RETURN_TO_QUEUE") &&
      Boolean((await returnToQueue(upNextLeaver.participantId)).message)
  );

  const courtMatch = controlGames.find((game) => game.courtId)!;
  await actions.startOpenPlayMatchAction(
    {},
    form({ sessionId: control.id, gameId: courtMatch.id })
  );
  const [liveLeaver, secondLiveLeaver] = courtMatch.players;
  const liveReturn = await returnToQueue(liveLeaver.participantId);
  const liveLeaverRow = await participantRow(liveLeaver.participantId);
  const liveMatchAfter = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: courtMatch.id },
    include: { players: true },
  });
  ok(
    "× on a playing player returns them while the match keeps going",
    Boolean(liveReturn.success) &&
      liveMatchAfter.status === "ACTIVE" &&
      liveMatchAfter.players.length === 3 &&
      liveLeaverRow.status === "QUEUED" &&
      liveLeaverRow.queuePosition === liveLeaver.queuePositionBefore &&
      liveLeaverRow.lastResult === "UNCLASSIFIED"
  );
  const recordControl = (gameId: string) =>
    actions.recordOpenPlayWinnerAction(
      {},
      form({ sessionId: control.id, gameId, winningTeam: 1 })
    );
  ok(
    "a live match with an open spot cannot record a result",
    (await recordControl(courtMatch.id)).message?.includes("open spot") === true &&
      (await prisma.openPlayGame.findUniqueOrThrow({ where: { id: courtMatch.id } }))
        .status === "ACTIVE"
  );
  const doubleReturn = await Promise.all([
    returnToQueue(secondLiveLeaver.participantId),
    returnToQueue(secondLiveLeaver.participantId),
  ]);
  ok(
    "returning the same player twice at once succeeds once",
    doubleReturn.filter((result) => result.success).length === 1 &&
      (await prisma.openPlayGamePlayer.count({ where: { gameId: courtMatch.id } })) === 2
  );
  const replacements = await prisma.openPlayParticipant.findMany({
    where: {
      sessionId: control.id,
      status: "QUEUED",
      id: { notIn: [liveLeaver.participantId, secondLiveLeaver.participantId] },
    },
    orderBy: { queuePosition: "asc" },
    take: 2,
  });
  for (const [index, replacement] of replacements.slice(0, 1).entries()) {
    await actions.fillOpenPlaySlotAction(
      {},
      form({
        sessionId: control.id,
        gameId: courtMatch.id,
        slot: [liveLeaver, secondLiveLeaver][index].slot,
        pick: "manual",
        participantId: replacement.id,
      })
    );
  }
  const filledReplacement = await prisma.openPlayGamePlayer.findFirst({
    where: { gameId: courtMatch.id, participantId: replacements[0]?.id },
    include: { participant: true },
  });
  ok(
    "a player picked into a live match joins it as playing",
    replacements.length === 2 &&
      filledReplacement?.participant.status === "PLAYING" &&
      filledReplacement.participant.queuePosition === null &&
      filledReplacement.queuePositionBefore === replacements[0].queuePosition &&
      (await prisma.openPlayGamePlayer.count({ where: { gameId: courtMatch.id } })) === 3
  );
  const boxBeforeMove = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: upNextBox.id },
    include: { players: true },
  });
  const mover = boxBeforeMove.players[0];
  const moveResult = await actions.fillOpenPlaySlotAction(
    {},
    form({
      sessionId: control.id,
      gameId: courtMatch.id,
      slot: secondLiveLeaver.slot,
      pick: "manual",
      participantId: mover.participantId,
    })
  );
  const movedRow = await prisma.openPlayGamePlayer.findFirst({
    where: { gameId: courtMatch.id, participantId: mover.participantId },
    include: { participant: true },
  });
  const boxAfterMove = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: upNextBox.id },
    include: { players: true },
  });
  ok(
    "a player in Up next can be moved into a live match's open spot",
    Boolean(moveResult.success) &&
      movedRow?.participant.status === "PLAYING" &&
      movedRow.queuePositionBefore === mover.queuePositionBefore &&
      boxAfterMove.status === "STAGED" &&
      boxAfterMove.players.length === boxBeforeMove.players.length - 1 &&
      (await prisma.openPlayGamePlayer.count({ where: { gameId: courtMatch.id } })) === 4
  );
  // Keep the player returned mid-game out of Replace player, so the later check
  // that they got no result for this match stays meaningful.
  await actions.checkOutOpenPlayParticipantAction(
    {},
    form({ sessionId: control.id, participantId: liveLeaver.participantId })
  );
  const liveBeforeSwap = await prisma.openPlayGamePlayer.findMany({
    where: { gameId: courtMatch.id },
    orderBy: { slot: "asc" },
  });
  const replacedRow = liveBeforeSwap[0];
  const replacement = await prisma.openPlayParticipant.findFirstOrThrow({
    where: { sessionId: control.id, status: "QUEUED" },
    orderBy: { queuePosition: "asc" },
  });
  const swapInResult = await actions.fillOpenPlaySlotAction(
    {},
    form({
      sessionId: control.id,
      gameId: courtMatch.id,
      slot: replacedRow.slot,
      pick: "manual",
      participantId: replacement.id,
      replaceParticipantId: replacedRow.participantId,
    })
  );
  const replacedAfter = await participantRow(replacedRow.participantId);
  const replacementSeat = await prisma.openPlayGamePlayer.findFirst({
    where: { gameId: courtMatch.id, participantId: replacement.id },
    include: { participant: true },
  });
  ok(
    "Replace player swaps someone out of a live match in one step",
    Boolean(swapInResult.success) &&
      replacedAfter.status === "QUEUED" &&
      replacedAfter.queuePosition === replacedRow.queuePositionBefore &&
      replacementSeat?.slot === replacedRow.slot &&
      replacementSeat.participant.status === "PLAYING" &&
      (await prisma.openPlayGamePlayer.count({ where: { gameId: courtMatch.id } })) === 4
  );
  const autoReplaced = (await prisma.openPlayGamePlayer.findMany({
    where: { gameId: courtMatch.id },
    orderBy: { slot: "asc" },
  }))[1];
  const autoReplaceResult = await actions.fillOpenPlaySlotAction(
    {},
    form({
      sessionId: control.id,
      gameId: courtMatch.id,
      slot: autoReplaced.slot,
      pick: "auto",
      replaceParticipantId: autoReplaced.participantId,
    })
  );
  const autoSeat = await prisma.openPlayGamePlayer.findFirst({
    where: { gameId: courtMatch.id, slot: autoReplaced.slot },
  });
  ok(
    "auto-pick never puts the replaced player straight back",
    Boolean(autoReplaceResult.success) &&
      autoSeat !== null &&
      autoSeat.participantId !== autoReplaced.participantId &&
      (await participantRow(autoReplaced.participantId)).status === "QUEUED"
  );
  ok(
    "Replace player refuses someone who is not in that match",
    Boolean(
      (
        await actions.fillOpenPlaySlotAction(
          {},
          form({
            sessionId: control.id,
            gameId: courtMatch.id,
            slot: 1,
            pick: "auto",
            replaceParticipantId: autoReplaced.participantId,
          })
        )
      ).message
    )
  );

  const switchTeams = (gameId: string, participantId: string, otherParticipantId: string) =>
    actions.switchOpenPlayTeamsAction(
      {},
      form({ sessionId: control.id, gameId, participantId, otherParticipantId })
    );
  const liveSeats = await prisma.openPlayGamePlayer.findMany({
    where: { gameId: courtMatch.id },
    orderBy: { slot: "asc" },
  });
  const teamOneSeat = liveSeats.find((seat) => seat.team === 1)!;
  const teamTwoSeat = liveSeats.find((seat) => seat.team === 2)!;
  const switchResult = await switchTeams(
    courtMatch.id,
    teamOneSeat.participantId,
    teamTwoSeat.participantId
  );
  const switchedSeats = await prisma.openPlayGamePlayer.findMany({
    where: { gameId: courtMatch.id },
  });
  const seatOf = (participantId: string) =>
    switchedSeats.find((seat) => seat.participantId === participantId);
  ok(
    "Switch teams swaps two players across a live match",
    Boolean(switchResult.success) &&
      seatOf(teamOneSeat.participantId)?.team === 2 &&
      seatOf(teamOneSeat.participantId)?.slot === teamTwoSeat.slot &&
      seatOf(teamTwoSeat.participantId)?.team === 1 &&
      seatOf(teamTwoSeat.participantId)?.slot === teamOneSeat.slot &&
      seatOf(teamTwoSeat.participantId)?.queuePositionBefore === teamTwoSeat.queuePositionBefore &&
      switchedSeats.length === 4
  );
  const teammates = switchedSeats.filter((seat) => seat.team === 1);
  ok(
    "Switch teams refuses two players on the same team",
    teammates.length === 2 &&
      Boolean((await switchTeams(courtMatch.id, teammates[0].participantId, teammates[1].participantId)).message)
  );
  const stagedForSwitch = await prisma.openPlayGame.findFirst({
    where: {
      sessionId: control.id,
      status: "STAGED",
      AND: [
        { players: { some: { team: 1 } } },
        { players: { some: { team: 2 } } },
      ],
    },
    include: { players: true },
  });
  if (stagedForSwitch) {
    const stagedOne = stagedForSwitch.players.find((seat) => seat.team === 1)!;
    const stagedTwo = stagedForSwitch.players.find((seat) => seat.team === 2)!;
    const stagedSwitch = await switchTeams(
      stagedForSwitch.id,
      stagedOne.participantId,
      stagedTwo.participantId
    );
    const stagedAfter = await prisma.openPlayGame.findUniqueOrThrow({
      where: { id: stagedForSwitch.id },
      include: { players: true },
    });
    ok(
      "Switch teams on an upcoming match marks it hand-picked",
      Boolean(stagedSwitch.success) &&
        stagedAfter.selectionMethod === "MANUAL" &&
        stagedAfter.players.find((seat) => seat.participantId === stagedOne.participantId)?.team === 2
    );
  } else {
    ok("an upcoming match with both teams exists for Switch teams", false);
  }

  ok(
    "a refilled live match records its result",
    Boolean((await recordControl(courtMatch.id)).success)
  );
  const swapWinner = () =>
    actions.swapOpenPlayWinnerAction({}, form({ sessionId: control.id, gameId: courtMatch.id }));
  const resultBefore = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: courtMatch.id },
    include: { players: { include: { participant: true } } },
  });
  const swapResult = await swapWinner();
  const resultAfter = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: courtMatch.id },
    include: { players: { include: { participant: true } } },
  });
  ok(
    "Swap winner flips the recorded result and each player's last result",
    Boolean(swapResult.success) &&
      resultBefore.winningTeam !== null &&
      resultAfter.winningTeam === (resultBefore.winningTeam === 1 ? 2 : 1) &&
      resultAfter.players.every(
        (seat) => seat.participant.lastResult === (seat.team === resultAfter.winningTeam ? "WIN" : "LOSS")
      )
  );
  await swapWinner();
  ok(
    "swapping again restores the original winner",
    (await prisma.openPlayGame.findUniqueOrThrow({ where: { id: courtMatch.id } })).winningTeam ===
      resultBefore.winningTeam
  );
  ok(
    "a player returned mid-game gets no result for that match",
    (await prisma.openPlayGamePlayer.count({
      where: { gameId: courtMatch.id, participantId: liveLeaver.participantId },
    })) === 0 &&
      (await participantRow(liveLeaver.participantId)).lastResult === "UNCLASSIFIED"
  );

  const emptyingBox = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: upNextBox.id },
    include: { players: true },
  });
  for (const player of emptyingBox.players) await returnToQueue(player.participantId);
  ok(
    "a match left with nobody is cancelled",
    (await prisma.openPlayGame.findUniqueOrThrow({ where: { id: upNextBox.id } }))
      .status === "CANCELLED"
  );

  const waitingPlayer = await prisma.openPlayParticipant.findFirstOrThrow({
    where: { sessionId: control.id, status: "QUEUED" },
    orderBy: { queuePosition: "asc" },
  });
  await actions.checkOutOpenPlayParticipantAction(
    {},
    form({ sessionId: control.id, participantId: waitingPlayer.id })
  );
  const leftRow = await participantRow(waitingPlayer.id);
  ok(
    "× in the Queue moves a waiting player to Left",
    leftRow.status === "CHECKED_OUT" && leftRow.queuePosition === null
  );
  await actions.checkInOpenPlayParticipantAction(
    {},
    form({ sessionId: control.id, participantId: waitingPlayer.id })
  );
  const backOfLine = await prisma.openPlayParticipant.aggregate({
    where: { sessionId: control.id, status: "QUEUED", id: { not: waitingPlayer.id } },
    _max: { queuePosition: true },
  });
  const rejoined = await participantRow(waitingPlayer.id);
  ok(
    "checking in from Left puts the player at the back of the queue",
    (rejoined.status === "QUEUED" &&
      rejoined.queuePosition! > (backOfLine._max.queuePosition ?? 0)) ||
      rejoined.status === "STAGED"
  );

  const removeBox = (values: Record<string, string | number>) =>
    actions.removeOpenPlayUpNextSlotAction({}, form({ sessionId: control.id, ...values }));
  await actions.addOpenPlayUpNextSlotAction({}, form({ sessionId: control.id }));
  ok("+ Add match adds an Up next box", (await controlSlots()) === 4);
  controlGames = await openGames();
  const courtStagedBefore = controlGames
    .filter((game) => game.status === "STAGED" && game.courtId)
    .map((game) => `${game.id}:${game.courtId}`)
    .sort();
  const handPickedBox = controlGames.filter((game) => !game.courtId).at(-1)!;
  await prisma.openPlayGame.update({
    where: { id: handPickedBox.id },
    data: { selectionMethod: "MANUAL" },
  });
  const boxRemoval = await removeBox({ gameId: handPickedBox.id });
  ok(
    "removing an Up next box cancels its match, even a hand-picked one",
    Boolean(boxRemoval.success) &&
      (await prisma.openPlayGame.findUniqueOrThrow({ where: { id: handPickedBox.id } }))
        .status === "CANCELLED" &&
      (await controlSlots()) === 3
  );
  ok(
    "a stale empty-box removal is refused",
    Boolean((await removeBox({ expectedSlots: 99 })).message) &&
      (await controlSlots()) === 3
  );
  await removeBox({ expectedSlots: 3 });
  await removeBox({ expectedSlots: 2 });
  ok(
    "Up next always keeps one box",
    (await removeBox({ expectedSlots: 1 })).message?.includes("at least one") === true &&
      (await controlSlots()) === 1
  );
  const courtStagedAfter = (await openGames())
    .filter((game) => game.status === "STAGED" && game.courtId)
    .map((game) => `${game.id}:${game.courtId}`)
    .sort();
  ok(
    "removing Up next boxes never touches matches waiting on a court",
    courtStagedBefore.every((key) => courtStagedAfter.includes(key))
  );
  await actions.addOpenPlayUpNextSlotAction({}, form({ sessionId: control.id }));
  await actions.addOpenPlayUpNextSlotAction({}, form({ sessionId: control.id }));

  controlGames = await openGames();
  const rebuildBox = controlGames.find((game) => !game.courtId && game.players.length === 4)!;
  await prisma.openPlayGame.update({
    where: { id: rebuildBox.id },
    data: { selectionMethod: "MANUAL" },
  });
  const rebuildResult = await actions.rebuildOpenPlayUpNextMatchAction(
    {},
    form({ sessionId: control.id, gameId: rebuildBox.id })
  );
  const rebuiltBox = await prisma.openPlayGame.findUniqueOrThrow({
    where: { id: rebuildBox.id },
    include: { players: true },
  });
  ok(
    "Rebuild keeps the box in place and builds a different automatic lineup",
    Boolean(rebuildResult.success) &&
      rebuiltBox.status === "STAGED" &&
      rebuiltBox.sequence === rebuildBox.sequence &&
      rebuiltBox.courtId === null &&
      rebuiltBox.players.length === 4 &&
      rebuiltBox.selectionMethod === "AUTOMATIC" &&
      domain.lineupKey(rebuiltBox.players) !== domain.lineupKey(rebuildBox.players)
  );

  controlGames = await openGames();
  const keptManual = controlGames.find((game) => !game.courtId)!;
  await prisma.openPlayGame.update({
    where: { id: keptManual.id },
    data: { selectionMethod: "MANUAL" },
  });
  const keepKeys = controlGames
    .filter((game) => game.id === keptManual.id || game.courtId)
    .map((game) => `${game.id}:${domain.lineupKey(game.players)}`)
    .sort();
  const refreshResult = await actions.refreshOpenPlayUpNextAction(
    {},
    form({ sessionId: control.id })
  );
  const keptAfter = (await openGames())
    .map((game) => `${game.id}:${domain.lineupKey(game.players)}`);
  ok(
    "Refresh Up next leaves hand-picked and court matches alone",
    Boolean(refreshResult.success || refreshResult.message) &&
      keepKeys.every((key) => keptAfter.includes(key))
  );

  const addCourt = (courtId?: string) =>
    actions.addOpenPlayCourtAction(
      {},
      form({ sessionId: control.id, ...(courtId ? { courtId } : {}) })
    );
  const slotsBeforeCourt = await controlSlots();
  const courtAdded = await addCourt(controlCourts[3].id);
  const addedCourtRow = await prisma.openPlaySessionCourt.findUnique({
    where: { sessionId_courtId: { sessionId: control.id, courtId: controlCourts[3].id } },
  });
  ok(
    "a venue run can add a free hub court",
    Boolean(courtAdded.success) &&
      addedCourtRow?.position === 3 &&
      addedCourtRow.active &&
      (await controlSlots()) === slotsBeforeCourt + 1
  );
  ok(
    "a court live in another BunalQ, a non-pickleball court, or one already in the run can't be added",
    Boolean((await addCourt(bufferCourts[0].id)).message) &&
      Boolean((await addCourt(tennisCourt.id)).message) &&
      Boolean((await addCourt(controlCourts[0].id)).message) &&
      (await prisma.openPlaySessionCourt.count({ where: { sessionId: control.id } })) === 4
  );
  const eventCourtOptions = await domain.listAddableOpenPlayCourts(prisma, {
    id: session.id,
    hubId: hub.id,
    eventId: event.id,
    courtIds: [],
  });
  ok(
    "an Event run can only add the event's own courts",
    eventCourtOptions.every((court) =>
      hub.courts.some((eventCourt) => eventCourt.id === court.id)
    )
  );

  const removeCourt = (courtId: string) =>
    actions.removeOpenPlayCourtAction({}, form({ sessionId: control.id, courtId }));
  controlGames = await openGames();
  const liveCandidate = controlGames.find(
    (game) =>
      game.status === "STAGED" &&
      game.courtId &&
      game.courtId !== courtMatch.courtId &&
      game.players.length === 4
  )!;
  await actions.startOpenPlayMatchAction(
    {},
    form({ sessionId: control.id, gameId: liveCandidate.id })
  );
  ok(
    "a court with a live match can't be removed",
    (await removeCourt(liveCandidate.courtId!)).message?.includes("Finish") === true
  );
  const finishedCourtId = courtMatch.courtId!;
  const waitingOnFinishedCourt = (await openGames()).find(
    (game) => game.status === "STAGED" && game.courtId === finishedCourtId
  );
  const slotsBeforeRemoval = await controlSlots();
  const courtRemoval = await removeCourt(finishedCourtId);
  ok(
    "removing a court sends its waiting match back to Up next",
    Boolean(courtRemoval.success) &&
      !(await prisma.openPlaySessionCourt.findUnique({
        where: { sessionId_courtId: { sessionId: control.id, courtId: finishedCourtId } },
      })) &&
      (await controlSlots()) === slotsBeforeRemoval - 1 &&
      (!waitingOnFinishedCourt ||
        (await prisma.openPlayGame.findUniqueOrThrow({
          where: { id: waitingOnFinishedCourt.id },
        })).status !== "STAGED" ||
        (await prisma.openPlayGame.findUniqueOrThrow({
          where: { id: waitingOnFinishedCourt.id },
        })).courtId !== finishedCourtId)
  );
  ok(
    "a removed court keeps its finished matches",
    (await prisma.openPlayGame.findUniqueOrThrow({ where: { id: courtMatch.id } }))
      .courtId === finishedCourtId
  );
  ok(
    "a result can't be undone after its court left the run",
    Boolean(
      (await actions.undoOpenPlayResultAction(
        {},
        form({ sessionId: control.id, gameId: courtMatch.id })
      )).message
    )
  );

  await actions.endOpenPlaySessionAction({}, form({ sessionId: control.id }));
  const endedControlCourts = (
    await prisma.openPlaySessionCourt.findMany({ where: { sessionId: control.id } })
  ).map((court) => court.courtId).sort();
  await actions.startNewOpenPlayRunAction({}, form({ sessionId: control.id }));
  const nextControlRun = await prisma.openPlaySession.findFirstOrThrow({
    where: { queueId: control.queueId, runNumber: 2 },
    include: { courts: true },
  });
  ok(
    "a new run copies the current courts and one Up next box per court",
    nextControlRun.courts.map((court) => court.courtId).sort().join() ===
      endedControlCourts.join() &&
      nextControlRun.upNextSlots === endedControlCourts.length
  );
  await actions.endOpenPlaySessionAction({}, form({ sessionId: nextControlRun.id }));

  const rebuildCandidates = (ids: string[], pairs: Array<string | null>) =>
    ids.map((id, index) => ({
      id,
      queuePosition: index + 1,
      skillLevel: "intermediate",
      lastResult: "UNCLASSIFIED" as const,
      pairId: pairs[index] ?? null,
    }));
  const sameFour = domain.chooseRebuiltMatch({
    mode: "BALANCED",
    queued: rebuildCandidates(["a", "b", "c", "d"], []),
    previous: [
      { participantId: "a", team: 1 },
      { participantId: "b", team: 1 },
      { participantId: "c", team: 2 },
      { participantId: "d", team: 2 },
    ],
  });
  ok(
    "Rebuild with only the same four players splits the teams differently",
    sameFour.kind === "NEW" &&
      selectedIds(sameFour.teams).join() === "a,b,c,d" &&
      !sameTeam(sameFour.teams, "a", "b")
  );
  const pairsOnly = (extra: boolean) =>
    domain.chooseRebuiltMatch({
      mode: "FIXED_PARTNERS",
      queued: rebuildCandidates(
        extra ? ["a", "b", "c", "d", "e", "f"] : ["a", "b", "c", "d"],
        ["p1", "p1", "p2", "p2", "p3", "p3"]
      ),
      previous: [
        { participantId: "a", team: 1 },
        { participantId: "b", team: 1 },
        { participantId: "c", team: 2 },
        { participantId: "d", team: 2 },
      ],
    });
  const swappedPairs = pairsOnly(true);
  ok(
    "Rebuild brings in the next pair when saved partners can't be split",
    swappedPairs.kind === "NEW" &&
      selectedIds(swappedPairs.teams).join() === "a,b,e,f"
  );
  ok(
    "Rebuild keeps the match when no other lineup exists",
    pairsOnly(false).kind === "UNCHANGED" &&
      domain.chooseRebuiltMatch({
        mode: "BALANCED",
        queued: rebuildCandidates(["a", "b", "c"], []),
        previous: [],
      }).kind === "NOT_ENOUGH_PLAYERS"
  );

  const teammateHistory = domain.buildTeammateHistory([
    {
      sequence: 2,
      players: [
        { participantId: "a", team: 1 },
        { participantId: "b", team: 1 },
        { participantId: "c", team: 2 },
        { participantId: "d", team: 2 },
      ],
    },
    {
      sequence: 1,
      players: [
        { participantId: "a", team: 1 },
        { participantId: "c", team: 1 },
        { participantId: "b", team: 2 },
        { participantId: "d", team: 2 },
      ],
    },
  ]);
  ok(
    "teammate history counts every partnership and follows game sequence for recency",
    teammateHistory.counts.get("a:b") === 1 &&
      teammateHistory.counts.get("a:c") === 1 &&
      teammateHistory.mostRecent.get("a") === "b" &&
      teammateHistory.mostRecent.get("b") === "a"
  );

  const multiCourtHistory = domain.buildTeammateHistory([
    {
      sequence: 3,
      completedAt: new Date("2026-09-07T04:00:00.000Z"),
      players: [
        { participantId: "a", team: 1 },
        { participantId: "b", team: 1 },
        { participantId: "c", team: 2 },
        { participantId: "d", team: 2 },
      ],
    },
    {
      sequence: 2,
      completedAt: new Date("2026-09-07T04:01:00.000Z"),
      players: [
        { participantId: "a", team: 1 },
        { participantId: "c", team: 1 },
        { participantId: "b", team: 2 },
        { participantId: "d", team: 2 },
      ],
    },
  ]);
  ok(
    "teammate recency follows completion time when courts finish out of sequence",
    multiCourtHistory.mostRecent.get("a") === "c" &&
      multiCourtHistory.mostRecent.get("c") === "a"
  );

  const balancedBySkill = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
    ],
  });
  ok(
    "Balanced mode uses skill balance after partner rotation is tied",
    !sameTeam(balancedBySkill, "a", "b")
  );

  const balancedWithoutRematch = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
    ],
    teammateHistory: {
      counts: new Map([["a:d", 1], ["b:c", 1]]),
      mostRecent: new Map([["a", "d"], ["d", "a"], ["b", "c"], ["c", "b"]]),
    },
  });
  ok(
    "Balanced mode avoids back-to-back partners before optimizing skill",
    !sameTeam(balancedWithoutRematch, "a", "d") &&
      !sameTeam(balancedWithoutRematch, "b", "c")
  );

  const balancedByUsage = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
    ],
    teammateHistory: {
      counts: new Map([["a:b", 1], ["c:d", 1], ["a:c", 2], ["b:d", 2]]),
      mostRecent: new Map(),
    },
  });
  ok(
    "Balanced mode chooses the least-used partnerships before skill balance",
    sameTeam(balancedByUsage, "a", "d") && sameTeam(balancedByUsage, "b", "c")
  );

  const balancedFixedPartner = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: "fixed" },
      { id: "x", queuePosition: 2, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "y", queuePosition: 3, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "z", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 5, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: "fixed" },
      { id: "w", queuePosition: 6, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
    ],
  });
  ok(
    "Balanced mode selects and keeps a saved fixed partnership together",
    sameTeam(balancedFixedPartner, "a", "b") &&
      selectedIds(balancedFixedPartner).includes("a") &&
      selectedIds(balancedFixedPartner).includes("b")
  );

  const balancedIncompleteFixedPartner = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: "waiting" },
      { id: "w", queuePosition: 2, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "x", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "y", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "z", queuePosition: 5, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
    ],
  });
  ok(
    "a saved pair waits rather than splitting when only one partner is queued",
    !selectedIds(balancedIncompleteFixedPartner).includes("a") &&
      selectedIds(balancedIncompleteFixedPartner).join(",") === "w,x,y,z"
  );

  const candidate = (
    id: string,
    queuePosition: number,
    skillLevel: string,
    pairId: string | null = null
  ) => ({ id, queuePosition, skillLevel, lastResult: "UNCLASSIFIED" as const, pairId });
  const seated = (id: string, team: number, skillLevel: string) => ({
    id,
    team,
    skillLevel,
    lastResult: "UNCLASSIFIED" as const,
  });
  const balancedOpenSpot = [
    seated("t1", 1, "advanced"),
    seated("o1", 2, "advanced"),
    seated("o2", 2, "beginner"),
  ];
  ok(
    "auto-pick favors the player who balances team skill",
    domain.chooseOpenSlotReplacement({
      mode: "BALANCED",
      team: 1,
      remaining: balancedOpenSpot,
      queued: [candidate("q1", 1, "advanced"), candidate("q2", 2, "beginner")],
    })?.id === "q2"
  );
  ok(
    "auto-pick only looks at the front of the queue",
    domain.chooseOpenSlotReplacement({
      mode: "BALANCED",
      team: 1,
      remaining: balancedOpenSpot,
      queued: [
        candidate("q1", 1, "advanced"),
        candidate("q2", 2, "advanced"),
        candidate("q3", 3, "advanced"),
        candidate("q4", 4, "advanced"),
        candidate("q5", 5, "beginner"),
      ],
    })?.id === "q1"
  );
  ok(
    "auto-pick keeps Skill Separated matches within one skill level",
    domain.chooseOpenSlotReplacement({
      mode: "SKILL_SEPARATED",
      team: 2,
      remaining: [
        seated("t1", 1, "beginner"),
        seated("t2", 1, "beginner"),
        seated("o1", 2, "beginner"),
      ],
      queued: [candidate("q1", 1, "advanced"), candidate("q2", 2, "beginner")],
    })?.id === "q2"
  );
  ok(
    "auto-pick avoids an immediate teammate repeat",
    domain.chooseOpenSlotReplacement({
      mode: "BALANCED",
      team: 1,
      remaining: balancedOpenSpot,
      queued: [candidate("q1", 1, "beginner"), candidate("q2", 2, "beginner")],
      teammateHistory: domain.buildTeammateHistory([
        {
          sequence: 1,
          players: [
            { participantId: "t1", team: 1 },
            { participantId: "q1", team: 1 },
            { participantId: "x", team: 2 },
            { participantId: "y", team: 2 },
          ],
        },
      ]),
    })?.id === "q2"
  );
  ok(
    "auto-pick does not split a saved pair when someone else can play",
    domain.chooseOpenSlotReplacement({
      mode: "BALANCED",
      team: 1,
      remaining: balancedOpenSpot,
      queued: [
        candidate("q1", 1, "beginner", "pair"),
        candidate("q2", 2, "beginner"),
      ],
    })?.id === "q2"
  );
  ok(
    "auto-pick returns nothing when no one is waiting",
    domain.chooseOpenSlotReplacement({
      mode: "BALANCED",
      team: 1,
      remaining: balancedOpenSpot,
      queued: [],
    }) === null
  );

  const roundRobinPartnerRotation = domain.chooseAutomaticMatch({
    mode: "ROUND_ROBIN",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
    ],
    completedGames: [
      {
        sequence: 1,
        players: [
          { participantId: "a", team: 1 },
          { participantId: "b", team: 1 },
          { participantId: "c", team: 2 },
          { participantId: "d", team: 2 },
        ],
      },
    ],
  });
  ok(
    "Round Robin rotates completed partnerships",
    !sameTeam(roundRobinPartnerRotation, "a", "b") &&
      !sameTeam(roundRobinPartnerRotation, "c", "d")
  );

  const roundRobinFixedPartner = domain.chooseAutomaticMatch({
    mode: "ROUND_ROBIN",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: "fixed" },
      { id: "b", queuePosition: 2, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: "fixed" },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
    ],
    completedGames: [
      {
        sequence: 1,
        players: [
          { participantId: "a", team: 1 },
          { participantId: "b", team: 1 },
          { participantId: "c", team: 2 },
          { participantId: "d", team: 2 },
        ],
      },
    ],
  });
  ok(
    "Round Robin keeps a saved fixed partnership together",
    sameTeam(roundRobinFixedPartner, "a", "b")
  );

  const roundRobinOpponentVariety = domain.chooseAutomaticMatch({
    mode: "ROUND_ROBIN",
    queued: [
      ...["a", "b", "c", "d", "e", "f", "g", "h"].map((id, index) => ({
        id,
        queuePosition: index + 1,
        skillLevel: "intermediate",
        lastResult: "UNCLASSIFIED" as const,
        pairId: null,
      })),
    ],
    completedGames: [
      {
        sequence: 1,
        players: [
          { participantId: "a", team: 1 },
          { participantId: "b", team: 1 },
          { participantId: "c", team: 2 },
          { participantId: "d", team: 2 },
        ],
      },
      {
        sequence: 2,
        players: [
          { participantId: "e", team: 1 },
          { participantId: "f", team: 1 },
          { participantId: "g", team: 2 },
          { participantId: "h", team: 2 },
        ],
      },
    ],
  });
  const roundRobinSelected = new Set(selectedIds(roundRobinOpponentVariety));
  ok(
    "Round Robin mixes previous match cohorts to increase opponent variety",
    ["a", "b", "c", "d"].filter((id) => roundRobinSelected.has(id)).length === 2
  );

  const roundRobinByGamesPlayed = domain.chooseAutomaticMatch({
    mode: "ROUND_ROBIN",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "x", queuePosition: 5, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "y", queuePosition: 6, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "z", queuePosition: 7, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
    ],
    completedGames: [
      {
        sequence: 1,
        players: [
          { participantId: "a", team: 1 },
          { participantId: "b", team: 1 },
          { participantId: "c", team: 2 },
          { participantId: "d", team: 2 },
        ],
      },
    ],
  });
  const roundRobinByGamesPlayedIds = new Set(selectedIds(roundRobinByGamesPlayed));
  ok(
    "Round Robin prioritizes players with fewer completed games",
    ["x", "y", "z"].every((id) => roundRobinByGamesPlayedIds.has(id))
  );

  const separated = domain.chooseAutomaticMatch({
    mode: "SKILL_SEPARATED",
    queued: [
      { id: "x", queuePosition: 1, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      ...["a", "b", "c", "d"].map((id, index) => ({ id, queuePosition: index + 2, skillLevel: "advanced", lastResult: "UNCLASSIFIED" as const, pairId: null })),
    ],
    teammateHistory: {
      counts: new Map([["a:b", 1], ["c:d", 1]]),
      mostRecent: new Map([["a", "b"], ["b", "a"], ["c", "d"], ["d", "c"]]),
    },
  });
  ok(
    "Skill Separated uses the earliest complete tier and rotates its partners",
    separated?.every((slot) => slot.participantId !== "x") === true &&
      !sameTeam(separated, "a", "b") &&
      !sameTeam(separated, "c", "d")
  );

  const winnersLosers = domain.chooseAutomaticMatch({
    mode: "WINNERS_LOSERS",
    queued: [
      { id: "w1", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: null },
      { id: "l1", queuePosition: 2, skillLevel: "advanced", lastResult: "LOSS", pairId: null },
      { id: "w2", queuePosition: 3, skillLevel: "beginner", lastResult: "WIN", pairId: null },
      { id: "l2", queuePosition: 4, skillLevel: "advanced", lastResult: "LOSS", pairId: null },
      { id: "l3", queuePosition: 5, skillLevel: "beginner", lastResult: "LOSS", pairId: null },
      { id: "l4", queuePosition: 6, skillLevel: "beginner", lastResult: "LOSS", pairId: null },
      { id: "w3", queuePosition: 7, skillLevel: "intermediate", lastResult: "WIN", pairId: null },
    ],
    teammateHistory: {
      counts: new Map([["l1:l2", 1], ["l3:l4", 1]]),
      mostRecent: new Map([["l1", "l2"], ["l2", "l1"], ["l3", "l4"], ["l4", "l3"]]),
    },
  });
  ok(
    "Winners / Losers uses a complete result cohort and rotates its partners",
    selectedIds(winnersLosers).join(",") === "l1,l2,l3,l4" &&
      !sameTeam(winnersLosers, "l1", "l2") &&
      !sameTeam(winnersLosers, "l3", "l4")
  );

  const winnersLosersFallback = domain.chooseAutomaticMatch({
    mode: "WINNERS_LOSERS",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "beginner", lastResult: "LOSS", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "advanced", lastResult: "WIN", pairId: null },
      { id: "e", queuePosition: 5, skillLevel: "beginner", lastResult: "LOSS", pairId: null },
    ],
  });
  ok(
    "Winners / Losers falls back to the first four when no cohort is complete",
    selectedIds(winnersLosersFallback).join(",") === "a,b,c,d"
  );

  const fixed = domain.chooseAutomaticMatch({
    mode: "FIXED_PARTNERS",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: "late" },
      { id: "b", queuePosition: 2, skillLevel: "beginner", lastResult: "LOSS", pairId: "first" },
      { id: "c", queuePosition: 3, skillLevel: "advanced", lastResult: "WIN", pairId: "first" },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "LOSS", pairId: "second" },
      { id: "e", queuePosition: 5, skillLevel: "intermediate", lastResult: "WIN", pairId: "second" },
      { id: "x", queuePosition: 6, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "f", queuePosition: 7, skillLevel: "beginner", lastResult: "LOSS", pairId: "incomplete" },
      { id: "g", queuePosition: 8, skillLevel: "beginner", lastResult: "LOSS", pairId: "late" },
    ],
  });
  ok(
    "Fixed Partners chooses the earliest two complete pairs and keeps them intact",
    selectedIds(fixed).join(",") === "b,c,d,e" &&
      sameTeam(fixed, "b", "c") &&
      sameTeam(fixed, "d", "e")
  );

  const incompleteFixed = domain.chooseAutomaticMatch({
    mode: "FIXED_PARTNERS",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: "one" },
      { id: "b", queuePosition: 2, skillLevel: "beginner", lastResult: "LOSS", pairId: "one" },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED", pairId: "incomplete" },
    ],
  });
  ok(
    "Fixed Partners waits for two complete pairs",
    incompleteFixed === null
  );

  for (const mode of ["BALANCED", "ROUND_ROBIN", "SKILL_SEPARATED", "WINNERS_LOSERS"] as const) {
    const tooFew = domain.chooseAutomaticMatch({
      mode,
      queued: [
        { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: null },
        { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "LOSS", pairId: null },
        { id: "c", queuePosition: 3, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      ],
    });
    ok(`${mode} waits for four queued players`, tooFew === null);
  }

  const deterministicInput = {
    mode: "BALANCED" as const,
    queued: [
      { id: "d", queuePosition: 4, skillLevel: "intermediate", lastResult: "UNCLASSIFIED" as const, pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "intermediate", lastResult: "UNCLASSIFIED" as const, pairId: null },
      { id: "a", queuePosition: 1, skillLevel: "intermediate", lastResult: "UNCLASSIFIED" as const, pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "intermediate", lastResult: "UNCLASSIFIED" as const, pairId: null },
    ],
  };
  const deterministicMatch = domain.chooseAutomaticMatch(deterministicInput);
  ok(
    "matching remains deterministic after queue sorting and score ties",
    sameTeam(deterministicMatch, "a", "b") &&
      sameTeam(deterministicMatch, "c", "d") &&
      deterministicMatch?.map((slot) => slot.participantId).join(",") ===
        "a,b,c,d"
  );

  const queue = await prisma.openPlayQueue.findUniqueOrThrow({
    where: { eventId: event.id },
  });
  let duplicateQueueRejected = false;
  try {
    await prisma.openPlayQueue.create({
      data: {
        publicId: `duplicate-${event.publicId}`,
        hubId: hub.id,
        eventId: event.id,
        title: "Duplicate",
        kind: "EVENT",
        createdById: partner.id,
      },
    });
  } catch (error) {
    duplicateQueueRejected = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
  ok("the database permits only one BunalQ room per Event", duplicateQueueRejected);

  const end = new FormData();
  end.set("sessionId", session.id);
  ok("an active run can be archived", Boolean((await actions.endOpenPlaySessionAction({}, end)).success));
  ok(
    "ending a run preserves removed players as removed",
    (await prisma.openPlayParticipant.findUniqueOrThrow({
      where: { id: removableQueued.id },
    })).status === "REMOVED"
  );
  const endedRosterRefresh = new FormData();
  endedRosterRefresh.set("sessionId", session.id);
  ok(
    "an ended Event run cannot report a successful roster refresh",
    Boolean(
      (await actions.syncOpenPlayRosterAction({}, endedRosterRefresh)).message
    )
  );
  const nextRun = new FormData();
  nextRun.set("sessionId", session.id);
  ok("an ended run can create a fresh run", Boolean((await actions.startNewOpenPlayRunAction({}, nextRun)).success));
  const runs = await prisma.openPlaySession.findMany({
    where: { queueId: queue.id },
    orderBy: { runNumber: "asc" },
    include: { participants: true },
  });
  ok("run history is preserved", runs.length === 2 && runs[0].status === "ENDED" && runs[1].runNumber === 2);
  ok(
    "the new Event run re-seeds the confirmed roster with reset attendance",
    runs[1].participants.length === session.participants.length &&
      runs[1].participants.every((participant) => participant.status === "NOT_CHECKED_IN")
  );

  const bulkRemove = new FormData();
  bulkRemove.set("sessionId", runs[1].id);
  runs[1].participants.slice(1, 3).forEach((participant) =>
    bulkRemove.append("participantId", participant.id)
  );
  bulkRemove.append("participantId", session.participants[0].id);
  const bulkRemoved = await actions.bulkRemoveOpenPlayParticipantsAction(
    {},
    bulkRemove
  );
  ok(
    "bulk removal is session-scoped and soft-removes eligible players",
    bulkRemoved.success?.includes("2 players removed") === true &&
      (await prisma.openPlayParticipant.count({
        where: {
          id: { in: runs[1].participants.slice(1, 3).map((participant) => participant.id) },
          status: "REMOVED",
        },
      })) === 2
  );
  const invalidPair = new FormData();
  invalidPair.set("sessionId", runs[1].id);
  invalidPair.set("firstId", runs[1].participants[0].id);
  invalidPair.set("secondId", runs[1].participants[1].id);
  ok(
    "removed players cannot be assigned as fixed partners",
    Boolean((await actions.pairOpenPlayParticipantsAction({}, invalidPair)).message)
  );

  const removablePair = new FormData();
  removablePair.set("sessionId", runs[1].id);
  removablePair.set("firstId", runs[1].participants[4].id);
  removablePair.set("secondId", runs[1].participants[5].id);
  ok(
    "inactive players can be assigned as fixed partners",
    Boolean((await actions.pairOpenPlayParticipantsAction({}, removablePair)).success)
  );
  const removablePairId = (
    await prisma.openPlayParticipant.findUniqueOrThrow({
      where: { id: runs[1].participants[4].id },
      select: { pairId: true },
    })
  ).pairId;
  const removePairedPlayer = new FormData();
  removePairedPlayer.set("sessionId", runs[1].id);
  removePairedPlayer.set("participantId", runs[1].participants[4].id);
  ok(
    "removing one fixed partner dissolves the pair without stranding the survivor",
    Boolean(
      (await actions.removeOpenPlayParticipantAction({}, removePairedPlayer))
        .success
    ) &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: runs[1].participants[5].id },
      })).pairId === null &&
      (await prisma.openPlayPair.count({
        where: { id: removablePairId ?? "" },
      })) === 0
  );

  const editPlayer = new FormData();
  editPlayer.set("sessionId", runs[1].id);
  editPlayer.set("participantId", runs[1].participants[5].id);
  editPlayer.set("displayName", "Edited for this run");
  editPlayer.set("skillLevel", "advanced");
  ok("staff can edit run-local player details", Boolean((await actions.editOpenPlayParticipantAction({}, editPlayer)).success));
  const refreshAfterEdit = new FormData();
  refreshAfterEdit.set("sessionId", runs[1].id);
  await actions.syncOpenPlayRosterAction({}, refreshAfterEdit);
  ok(
    "Event roster refresh preserves run-local player overrides",
    (await prisma.openPlayParticipant.findUniqueOrThrow({
      where: { id: runs[1].participants[5].id },
    })).displayName === "Edited for this run"
  );
  const newlyPrivate = runs[1].participants.find(
    (participant) => participant.userId === players[6].id
  );
  await prisma.user.update({
    where: { id: players[6].id },
    data: { privateProfile: true },
  });
  await actions.syncOpenPlayRosterAction({}, refreshAfterEdit);
  ok(
    "Event roster refresh masks players who make their profile private",
    Boolean(newlyPrivate) &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: newlyPrivate!.id },
      })).displayName === "Private player"
  );
  const removePlayer = new FormData();
  removePlayer.set("sessionId", runs[1].id);
  removePlayer.set("participantId", runs[1].participants[3].id);
  ok("staff can soft-remove an inactive player", Boolean((await actions.removeOpenPlayParticipantAction({}, removePlayer)).success));
  ok("soft removal keeps the participant row", (await prisma.openPlayParticipant.findUniqueOrThrow({ where: { id: runs[1].participants[3].id } })).status === "REMOVED");
  const startNextRun = new FormData();
  startNextRun.set("sessionId", runs[1].id);
  ok("the next Event run can start on the Event date", Boolean((await actions.startOpenPlaySessionAction({}, startNextRun)).success));
  const eventEndsAt = manilaInstant(date, 23);
  const eventGraceResult = await maintenance.cleanupStaleOpenPlaySessions({
    now: new Date(eventEndsAt.getTime() + maintenance.EVENT_RUN_END_GRACE_MS / 2),
    sessionIds: [runs[1].id],
  });
  ok("Event runs remain active during the cleanup grace period", eventGraceResult.eventRuns === 0);
  const eventCleanup = await maintenance.cleanupStaleOpenPlaySessions({
    now: new Date(eventEndsAt.getTime() + maintenance.EVENT_RUN_END_GRACE_MS + 60_000),
    sessionIds: [runs[1].id],
  });
  const cleanedEventRun = await prisma.openPlaySession.findUniqueOrThrow({
    where: { id: runs[1].id },
    include: { participants: true },
  });
  ok(
    "Event BunalQ runs auto-end after the scheduled grace period",
    eventCleanup.eventRuns === 1 &&
      cleanedEventRun.status === "ENDED" &&
      cleanedEventRun.participants.every((participant) =>
        ["CHECKED_OUT", "REMOVED"].includes(participant.status)
      )
  );
  const endedEdit = new FormData();
  endedEdit.set("sessionId", runs[1].id);
  endedEdit.set("participantId", runs[1].participants[5].id);
  endedEdit.set("displayName", "Should not change");
  endedEdit.set("skillLevel", "beginner");
  ok(
    "ended run history cannot be edited by a stale form",
    Boolean((await actions.editOpenPlayParticipantAction({}, endedEdit)).message) &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: runs[1].participants[5].id },
      })).displayName === "Edited for this run"
  );
  ok(
    "Event cleanup is idempotent",
    (await maintenance.cleanupStaleOpenPlaySessions({
      now: new Date(eventEndsAt.getTime() + maintenance.EVENT_RUN_END_GRACE_MS + 120_000),
      sessionIds: [runs[1].id],
    })).eventRuns === 0
  );

  const quickPublicId = `quick-${partner.id}`;
  const quickSession = await prisma.openPlaySession.create({
    data: {
      queue: {
        create: {
          publicId: quickPublicId,
          hubId: hub.id,
          title: "Public Quick Queue",
          kind: "QUICK",
          admissionMode: "APPROVAL_REQUIRED",
          createdById: partner.id,
        },
      },
      status: "ACTIVE",
      startedAt: new Date(),
      createdById: partner.id,
      courts: { create: { courtId: hub.courts[0].id, position: 0 } },
    },
  });
  const conflictingQuick = new FormData();
  conflictingQuick.set("hubId", hub.id);
  conflictingQuick.set("title", "Conflicting Quick Queue");
  conflictingQuick.set("matchingMode", "BALANCED");
  conflictingQuick.set("admissionMode", "APPROVAL_REQUIRED");
  conflictingQuick.append("courtId", hub.courts[0].id);
  ok(
    "a court cannot be assigned to two active BunalQ runs",
    (await actions.createQuickQueueAction({}, conflictingQuick)).message?.includes(
      "already assigned"
    ) === true
  );
  const publicJoin = new FormData();
  publicJoin.set("publicId", quickPublicId);
  publicJoin.set("displayName", "Public Guest");
  publicJoin.set("skillLevel", "beginner");
  const revisionBeforeJoin = await domain.getOpenPlayLiveRevision(quickPublicId);
  ok("a public guest can request Quick Queue access without an account", Boolean((await actions.joinPublicQueueAction({}, publicJoin)).success));
  ok(
    "duplicate active public guest names are rejected",
    (await actions.joinPublicQueueAction({}, publicJoin)).message?.includes(
      "already in this queue"
    ) === true
  );
  const pendingGuest = await prisma.openPlayParticipant.findFirstOrThrow({ where: { sessionId: quickSession.id, source: "PUBLIC_GUEST" } });
  ok("approval mode keeps the guest pending", pendingGuest.status === "PENDING_APPROVAL");
  const hiddenSnapshot = await domain.getPublicOpenPlaySnapshot(quickPublicId);
  ok("pending guest identities are hidden from the public board", hiddenSnapshot?.participants.length === 0);
  ok(
    "pending guest requests advance the live revision without exposing their identity",
    revisionBeforeJoin !== await domain.getOpenPlayLiveRevision(quickPublicId)
  );
  const approveGuest = new FormData();
  approveGuest.set("sessionId", quickSession.id);
  approveGuest.set("participantId", pendingGuest.id);
  ok("staff can approve and check in a pending guest", Boolean((await actions.approvePublicQueueGuestAction({}, approveGuest)).success));
  ok("approved guests appear in the public queue", (await domain.getPublicOpenPlaySnapshot(quickPublicId))?.participants.length === 1);
  publicJoin.set("displayName", "Still Pending Guest");
  ok(
    "a second public request can remain pending until the run closes",
    Boolean((await actions.joinPublicQueueAction({}, publicJoin)).success)
  );
  const stillPendingGuest = await prisma.openPlayParticipant.findFirstOrThrow({
    where: {
      sessionId: quickSession.id,
      displayName: "Still Pending Guest",
    },
  });
  const quickGraceResult = await maintenance.cleanupStaleOpenPlaySessions({
    now: new Date(quickSession.startedAt!.getTime() + maintenance.QUICK_QUEUE_INACTIVITY_MS - 60_000),
    sessionIds: [quickSession.id],
  });
  ok("recent standalone BunalQ runs remain active", quickGraceResult.quickQueues === 0);
  const quickCleanup = await maintenance.cleanupStaleOpenPlaySessions({
    now: new Date(quickSession.startedAt!.getTime() + maintenance.QUICK_QUEUE_INACTIVITY_MS + 60_000),
    sessionIds: [quickSession.id],
  });
  const cleanedQuickRun = await prisma.openPlaySession.findUniqueOrThrow({
    where: { id: quickSession.id },
    include: { participants: true },
  });
  ok(
    "inactive standalone BunalQ runs auto-end",
    quickCleanup.quickQueues === 1 &&
      cleanedQuickRun.status === "ENDED" &&
      cleanedQuickRun.participants.every((participant) =>
        ["CHECKED_OUT", "REMOVED"].includes(participant.status)
      ) &&
      cleanedQuickRun.participants.find(
        (participant) => participant.id === stillPendingGuest.id
      )?.status === "REMOVED"
  );
  const nextQuickRun = new FormData();
  nextQuickRun.set("sessionId", quickSession.id);
  ok(
    "an ended Quick Queue can create another run",
    Boolean((await actions.startNewOpenPlayRunAction({}, nextQuickRun)).success)
  );
  ok(
    "unapproved public requests do not carry into a new run",
    (await prisma.openPlayParticipant.count({
      where: {
        session: { queue: { publicId: quickPublicId }, runNumber: 2 },
        displayName: "Still Pending Guest",
      },
    })) === 0 &&
      (await prisma.openPlayParticipant.count({
        where: {
          session: { queue: { publicId: quickPublicId }, runNumber: 2 },
          source: "PUBLIC_GUEST",
        },
      })) === 1
  );

  const guestCreate = new FormData();
  guestCreate.set("title", "Anonymous Check Queue");
  guestCreate.set("courtCount", "3");
  guestCreate.set("matchingMode", "ROUND_ROBIN");
  guestCreate.set("admissionMode", "APPROVAL_REQUIRED");
  let guestRedirected = false;
  try {
    await actions.createGuestQuickQueueAction({}, guestCreate);
  } catch (error) {
    guestRedirected =
      error instanceof Error && error.message.includes("unexpected redirect");
  }
  const guestQueue = await prisma.openPlayQueue.findFirstOrThrow({
    where: { title: "Anonymous Check Queue" },
    include: {
      hub: { include: { owner: true, courts: true } },
      sessions: { orderBy: { runNumber: "desc" }, take: 1 },
    },
  });
  const guestRun = guestQueue.sessions[0]!;
  ok(
    "an anonymous browser can create an active unlisted BunalQ",
    guestRedirected &&
      guestQueue.kind === "QUICK" &&
      !guestQueue.directoryListed &&
      guestQueue.hub.guestBunalQOnly &&
      guestQueue.hub.owner.isGuestBunalQOrganizer &&
      guestQueue.hub.courts.length === 3 &&
      guestRun.status === "ACTIVE" &&
      guestRun.matchingMode === "ROUND_ROBIN"
  );
  ok(
    "guest-created BunalQ rooms stay out of the public directory",
    !(await domain.listPublicBunalQQueues()).some(
      (listed) => listed.publicId === guestQueue.publicId
    )
  );
  ok(
    "guest-created BunalQ rooms retain a public player board",
    (await domain.getPublicOpenPlaySnapshot(guestQueue.publicId))?.queue
      .guestCreated === true
  );

  const guestWalkIn = new FormData();
  guestWalkIn.set("sessionId", guestRun.id);
  guestWalkIn.set("publicId", guestQueue.publicId);
  guestWalkIn.set("displayName", "Browser-managed Player");
  guestWalkIn.set("skillLevel", "intermediate");
  ok(
    "the creating browser receives the full organizer action path",
    Boolean((await actions.addOpenPlayWalkInAction({}, guestWalkIn)).success)
  );
  const guestWalkInRow = await prisma.openPlayParticipant.findFirst({
    where: { sessionId: guestRun.id, displayName: "Browser-managed Player" },
  });
  ok(
    "a walk-in added by staff joins the back of the queue at once",
    guestWalkInRow?.status === "QUEUED" &&
      guestWalkInRow.queuePosition !== null &&
      guestWalkInRow.checkedInAt !== null &&
      guestWalkInRow.queuedAt !== null
  );
  const organizerCookie = [...requestContext.cookies.entries()][0];
  requestContext.cookies.clear();
  ok(
    "a browser without the organizer cookie cannot mutate a guest queue",
    Boolean((await actions.addOpenPlayWalkInAction({}, guestWalkIn)).message)
  );
  if (organizerCookie) requestContext.cookies.set(...organizerCookie);

  ok("a guest room starts with one Up next box per court", guestRun.upNextSlots === 3);
  const guestCourtForm = (courtId?: string) => {
    const data = new FormData();
    data.set("sessionId", guestRun.id);
    if (courtId) data.set("courtId", courtId);
    return data;
  };
  const guestRunCourts = async () =>
    prisma.openPlaySessionCourt.findMany({
      where: { sessionId: guestRun.id },
      include: { court: true },
      orderBy: { position: "asc" },
    });
  const guestAdded = await actions.addOpenPlayCourtAction({}, guestCourtForm());
  let guestCourts = await guestRunCourts();
  ok(
    "a guest organizer adds the next numbered court",
    Boolean(guestAdded.success) &&
      guestCourts.length === 4 &&
      guestCourts.at(-1)?.court.name === "Court 4" &&
      (await prisma.court.count({ where: { hubId: guestQueue.hubId } })) === 4
  );
  const guestCourtTwo = guestCourts.find((row) => row.court.name === "Court 2")!;
  await actions.removeOpenPlayCourtAction({}, guestCourtForm(guestCourtTwo.courtId));
  await actions.addOpenPlayCourtAction({}, guestCourtForm());
  guestCourts = await guestRunCourts();
  ok(
    "adding a court again brings back a removed guest court",
    guestCourts.some((row) => row.courtId === guestCourtTwo.courtId) &&
      (await prisma.court.count({ where: { hubId: guestQueue.hubId } })) === 4
  );
  while ((await guestRunCourts()).length < 12) {
    await actions.addOpenPlayCourtAction({}, guestCourtForm());
  }
  ok(
    "a run holds at most 12 courts",
    Boolean((await actions.addOpenPlayCourtAction({}, guestCourtForm())).message) &&
      (await guestRunCourts()).length === 12
  );
  for (const row of (await guestRunCourts()).slice(1)) {
    await actions.removeOpenPlayCourtAction({}, guestCourtForm(row.courtId));
  }
  guestCourts = await guestRunCourts();
  ok(
    "the last court can't be removed",
    guestCourts.length === 1 &&
      (await actions.removeOpenPlayCourtAction({}, guestCourtForm(guestCourts[0].courtId)))
        .message?.includes("at least one") === true
  );
  requestContext.cookies.clear();
  ok(
    "a browser without the organizer cookie cannot add courts",
    Boolean((await actions.addOpenPlayCourtAction({}, guestCourtForm())).message) &&
      (await guestRunCourts()).length === 1
  );
  if (organizerCookie) requestContext.cookies.set(...organizerCookie);

  const endGuestQueue = new FormData();
  endGuestQueue.set("sessionId", guestRun.id);
  ok(
    "the guest organizer can end the queue",
    Boolean((await actions.endOpenPlaySessionAction({}, endGuestQueue)).success)
  );
  const endedGuestRun = await prisma.openPlaySession.findUniqueOrThrow({
    where: { id: guestRun.id },
    select: { endedAt: true },
  });
  const justBeforeGuestDeletion = new Date(
    endedGuestRun.endedAt!.getTime() + maintenance.GUEST_BUNALQ_RETENTION_MS - 1
  );
  ok(
    "ended guest queues remain available for 24 hours",
    (await maintenance.cleanupExpiredGuestBunalQQueues({
      now: justBeforeGuestDeletion,
      sessionIds: [guestRun.id],
    })) === 0 &&
      Boolean(await prisma.openPlayQueue.findUnique({ where: { id: guestQueue.id } }))
  );
  ok(
    "guest queue data is deleted after the 24-hour retention window",
    (await maintenance.cleanupExpiredGuestBunalQQueues({
      now: new Date(justBeforeGuestDeletion.getTime() + 2),
      sessionIds: [guestRun.id],
    })) === 1 &&
      !(await prisma.openPlayQueue.findUnique({ where: { id: guestQueue.id } })) &&
      !(await prisma.user.findUnique({ where: { id: guestQueue.hub.ownerId } }))
  );

  const eventPublicJoin = new FormData();
  eventPublicJoin.set("publicId", queue.publicId);
  eventPublicJoin.set("displayName", "Payment Bypass");
  eventPublicJoin.set("skillLevel", "intermediate");
  ok("public self-join cannot bypass Event registration", Boolean((await actions.joinPublicQueueAction({}, eventPublicJoin)).message));

  const eventActions = await import("@/lib/event-actions");
  const cancel = new FormData();
  cancel.set("eventId", event.id);
  cancel.set("reason", "Venue closed for the day.");
  cancel.set("refund", "none");
  ok("Event cancellation succeeds with a prepared queue", Boolean((await eventActions.cancelEventAction({}, cancel)).success));
  const cancelledRuns = await prisma.openPlaySession.findMany({
    where: { queueId: queue.id },
    include: { participants: true, games: true },
  });
  ok(
    "Event cancellation ends live operations without deleting history",
    cancelledRuns.every((run) => run.status === "ENDED") &&
      cancelledRuns.flatMap((run) => run.participants).every((participant) => ["CHECKED_OUT", "REMOVED"].includes(participant.status)) &&
      cancelledRuns.flatMap((run) => run.games).some((game) => game.status === "COMPLETED")
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
