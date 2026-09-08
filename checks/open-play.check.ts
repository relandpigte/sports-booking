// Partner-only live Open Play queue, deterministic matching, and result safety.
//
//   npm run check:open-play
import { Prisma, PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
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
    where: { hub: { owner: { email: PARTNER_EMAIL } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, ...PLAYER_EMAILS] } },
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
        create: [{ name: "Court 1" }, { name: "Court 2" }],
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

  stubRequestContext(partner, { stubPublicRequest: true });
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

  const stagedPlayerId = automaticGame.players[0].participantId;
  const replacedAutomaticGameId = automaticGame.id;
  const replacedAutomaticCourtId = automaticGame.courtId;
  const sitOutUpNext = new FormData();
  sitOutUpNext.set("sessionId", session.id);
  sitOutUpNext.set("participantId", stagedPlayerId);
  const sitOutResult = await actions.pauseOpenPlayParticipantAction(
    {},
    sitOutUpNext
  );
  const replacementGame = await prisma.openPlayGame.findFirstOrThrow({
    where: {
      sessionId: session.id,
      status: "STAGED",
      selectionMethod: "AUTOMATIC",
      id: { not: replacedAutomaticGameId },
    },
    include: { players: true },
  });
  ok(
    "staff can sit out a player from Up next",
    sitOutResult.success?.includes("updated automatically") === true &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: stagedPlayerId },
      })).status === "PAUSED" &&
      (await prisma.openPlayGame.findUniqueOrThrow({
        where: { id: replacedAutomaticGameId },
      })).status === "CANCELLED"
  );
  ok(
    "sitting out a staged player automatically replaces the upcoming match",
    replacementGame.courtId === replacedAutomaticCourtId &&
      replacementGame.players.length === 4 &&
      replacementGame.players.every(
        (slot) => slot.participantId !== stagedPlayerId
      ) &&
      (await prisma.openPlayGame.count({
        where: { sessionId: session.id, status: "STAGED" },
      })) === 2
  );

  const resumeStagedPlayer = new FormData();
  resumeStagedPlayer.set("sessionId", session.id);
  resumeStagedPlayer.set("participantId", stagedPlayerId);
  await actions.resumeOpenPlayParticipantAction({}, resumeStagedPlayer);
  automaticGame = await prisma.openPlayGame.findFirstOrThrow({
    where: {
      id: replacementGame.id,
      sessionId: session.id,
      status: "STAGED",
      selectionMethod: "AUTOMATIC",
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
        create: hub.courts.map((court, index) => ({
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
    "BunalQ maintains two prepared matches beyond staged court matchups",
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

  const editPlayer = new FormData();
  editPlayer.set("sessionId", runs[1].id);
  editPlayer.set("participantId", runs[1].participants[0].id);
  editPlayer.set("displayName", "Edited for this run");
  editPlayer.set("skillLevel", "advanced");
  ok("staff can edit run-local player details", Boolean((await actions.editOpenPlayParticipantAction({}, editPlayer)).success));
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
  endedEdit.set("participantId", runs[1].participants[0].id);
  endedEdit.set("displayName", "Should not change");
  endedEdit.set("skillLevel", "beginner");
  ok(
    "ended run history cannot be edited by a stale form",
    Boolean((await actions.editOpenPlayParticipantAction({}, endedEdit)).message) &&
      (await prisma.openPlayParticipant.findUniqueOrThrow({
        where: { id: runs[1].participants[0].id },
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
  const publicJoin = new FormData();
  publicJoin.set("publicId", quickPublicId);
  publicJoin.set("displayName", "Public Guest");
  publicJoin.set("skillLevel", "beginner");
  const revisionBeforeJoin = await domain.getOpenPlayLiveRevision(quickPublicId);
  ok("a public guest can request Quick Queue access without an account", Boolean((await actions.joinPublicQueueAction({}, publicJoin)).success));
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
