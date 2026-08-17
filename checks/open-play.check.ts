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
  await prisma.openPlaySession.deleteMany({
    where: { event: { hub: { owner: { email: PARTNER_EMAIL } } } },
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

  stubRequestContext(partner);
  const actions = await import("@/lib/open-play-actions");
  const domain = await import("@/lib/open-play");

  const prepare = new FormData();
  prepare.set("publicId", event.publicId);
  const prepared = await actions.prepareOpenPlayAction({}, prepare);
  ok("an active partner can prepare an Event queue", Boolean(prepared.success));
  const session = await prisma.openPlaySession.findUniqueOrThrow({
    where: { eventId: event.id },
    include: { participants: { orderBy: { createdAt: "asc" } }, courts: true },
  });
  ok("confirmed registrations and organizer guests seed the roster", session.participants.length === 9);
  ok("private profiles use a non-identifying queue name", session.participants.some((row) => row.displayName === "Private player"));
  ok("every Event court is enabled for rotation", session.courts.length === 2 && session.courts.every((court) => court.active));

  const duplicatePrepare = await actions.prepareOpenPlayAction({}, prepare);
  ok(
    "preparation is idempotent",
    Boolean(duplicatePrepare.success) &&
      (await prisma.openPlaySession.count({ where: { eventId: event.id } })) === 1
  );

  for (const participant of session.participants.slice(0, 8)) {
    const form = new FormData();
    form.set("sessionId", session.id);
    form.set("participantId", participant.id);
    await actions.checkInOpenPlayParticipantAction({}, form);
  }
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

  let duplicateSessionRejected = false;
  try {
    await prisma.openPlaySession.create({ data: { eventId: event.id, createdById: partner.id } });
  } catch (error) {
    duplicateSessionRejected = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
  ok("the database permits only one queue per Event", duplicateSessionRejected);

  const eventActions = await import("@/lib/event-actions");
  const cancel = new FormData();
  cancel.set("eventId", event.id);
  cancel.set("reason", "Venue closed for the day.");
  cancel.set("refund", "none");
  ok("Event cancellation succeeds with a prepared queue", Boolean((await eventActions.cancelEventAction({}, cancel)).success));
  const cancelledSession = await prisma.openPlaySession.findUniqueOrThrow({
    where: { id: session.id },
    include: { participants: true, games: true },
  });
  ok(
    "Event cancellation ends live operations without deleting history",
    cancelledSession.status === "ENDED" &&
      cancelledSession.participants.every((participant) => participant.status === "CHECKED_OUT") &&
      cancelledSession.games.some((game) => game.status === "COMPLETED")
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
