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
  const start = new FormData();
  start.set("sessionId", session.id);
  ok("the queue starts on the Event's Manila date", Boolean((await actions.startOpenPlaySessionAction({}, start)).success));

  const stage = new FormData();
  stage.set("sessionId", session.id);
  stage.set("courtId", hub.courts[0].id);
  ok("the first eligible match can be staged", Boolean((await actions.stageOpenPlayMatchAction({}, stage)).success));
  const stagedGame = await prisma.openPlayGame.findFirstOrThrow({
    where: { sessionId: session.id, status: "STAGED" },
    include: { players: true },
  });
  ok("staging assigns exactly four unique players", stagedGame.players.length === 4 && new Set(stagedGame.players.map((slot) => slot.participantId)).size === 4);

  const startGame = new FormData();
  startGame.set("sessionId", session.id);
  startGame.set("gameId", stagedGame.id);
  const startResults = await Promise.all([
    actions.startOpenPlayMatchAction({}, startGame),
    actions.startOpenPlayMatchAction({}, startGame),
  ]);
  ok("a staged match starts once under concurrent submissions", startResults.filter((result) => result.success).length === 1);
  ok("a duplicate concurrent start is rejected", startResults.filter((result) => result.message).length === 1);

  const winner = new FormData();
  winner.set("sessionId", session.id);
  winner.set("gameId", stagedGame.id);
  winner.set("winningTeam", "1");
  const winnerResults = await Promise.all([
    actions.recordOpenPlayWinnerAction({}, winner),
    actions.recordOpenPlayWinnerAction({}, winner),
  ]);
  ok("a winner returns all players to the queue", winnerResults.filter((result) => result.success).length === 1);
  ok("a duplicate concurrent result is rejected", winnerResults.filter((result) => result.message).length === 1);
  ok(
    "the result is counted exactly once",
    (await prisma.openPlayGame.count({ where: { id: stagedGame.id, status: "COMPLETED", winningTeam: 1 } })) === 1
  );

  const snapshot = await domain.getPublicOpenPlaySnapshot(event.publicId);
  const serialized = JSON.stringify(snapshot);
  ok("public snapshots expose the live queue", Boolean(snapshot?.participants.length));
  ok("public snapshots omit email, phone, and payment fields", !serialized.includes("@example.test") && !serialized.includes("phone") && !serialized.includes("payment"));

  const balanced = domain.chooseAutomaticMatch({
    mode: "BALANCED",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "b", queuePosition: 2, skillLevel: "advanced", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "c", queuePosition: 3, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
    ],
  });
  ok(
    "Balanced mode splits strong players across teams",
    balanced?.find((slot) => slot.participantId === "a")?.team !==
      balanced?.find((slot) => slot.participantId === "b")?.team
  );
  const separated = domain.chooseAutomaticMatch({
    mode: "SKILL_SEPARATED",
    queued: [
      { id: "x", queuePosition: 1, skillLevel: "beginner", lastResult: "UNCLASSIFIED", pairId: null },
      ...["a", "b", "c", "d"].map((id, index) => ({ id, queuePosition: index + 2, skillLevel: "advanced", lastResult: "UNCLASSIFIED" as const, pairId: null })),
    ],
  });
  ok("Skill Separated waits for a complete tier", separated?.every((slot) => slot.participantId !== "x") === true);
  const fixed = domain.chooseAutomaticMatch({
    mode: "FIXED_PARTNERS",
    queued: [
      { id: "a", queuePosition: 1, skillLevel: "advanced", lastResult: "WIN", pairId: "one" },
      { id: "b", queuePosition: 3, skillLevel: "beginner", lastResult: "LOSS", pairId: "one" },
      { id: "c", queuePosition: 2, skillLevel: "advanced", lastResult: "WIN", pairId: "two" },
      { id: "d", queuePosition: 4, skillLevel: "beginner", lastResult: "LOSS", pairId: "two" },
    ],
  });
  ok(
    "Fixed Partners keeps each pair on one team",
    fixed?.find((slot) => slot.participantId === "a")?.team === fixed?.find((slot) => slot.participantId === "b")?.team &&
      fixed?.find((slot) => slot.participantId === "c")?.team === fixed?.find((slot) => slot.participantId === "d")?.team
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
    "the new run copies players with reset attendance",
    runs[1].participants.length === session.participants.length &&
      runs[1].participants.every((participant) => participant.status === "NOT_CHECKED_IN")
  );

  const editPlayer = new FormData();
  editPlayer.set("sessionId", runs[1].id);
  editPlayer.set("participantId", runs[1].participants[0].id);
  editPlayer.set("displayName", "Edited for this run");
  editPlayer.set("skillLevel", "advanced");
  ok("staff can edit run-local player details", Boolean((await actions.editOpenPlayParticipantAction({}, editPlayer)).success));
  const removePlayer = new FormData();
  removePlayer.set("sessionId", runs[1].id);
  removePlayer.set("participantId", runs[1].participants[1].id);
  ok("staff can soft-remove an inactive player", Boolean((await actions.removeOpenPlayParticipantAction({}, removePlayer)).success));
  ok("soft removal keeps the participant row", (await prisma.openPlayParticipant.findUniqueOrThrow({ where: { id: runs[1].participants[1].id } })).status === "REMOVED");

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
