// When a venue or trainer can take payments.
//
//   npm run check:readiness
//
// Two questions that used to be one. "Verified" is the venue's own setup: a
// payout account for automatic checkout, or a manual destination. "Bookable"
// additionally needs Bunal.club's PayMongo account connected, because that is
// the account every automatic payment is charged through. Conflating them
// would either un-verify every venue when the platform account blips, or let
// players start checkouts that cannot be charged.
import { PrismaClient } from "@prisma/client";

import {
  CHECK_PLATFORM_SECRET_KEY,
  enablePlatformCollection,
  ok,
  run,
  seedPayoutAccount,
  stubRequestContext,
} from "./harness";

const prisma = new PrismaClient();
const EMAIL = "check-readiness-partner@example.test";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function check() {
  await cleanup();
  enablePlatformCollection();
  // Nothing here needs a signed-in user; this only keeps the modules under
  // test from loading the client router.
  stubRequestContext({ id: "readiness-check", email: EMAIL });

  const {
    trainerCheckoutReady,
    trainerSetupReady,
    venueCheckoutReady,
    venueSetupReady,
  } = await import("@/lib/payment-readiness");

  // --- 1. The predicates, exhaustively --------------------------------------
  const account = { id: "account" };
  const method = [{ id: "method" }];
  const venue = (
    partnerPaymentMode: "AUTOMATIC" | "MANUAL",
    hasAccount: boolean,
    hasMethod: boolean
  ) => ({
    partnerPaymentMode,
    payoutAccount: hasAccount ? account : null,
    manualPaymentMethods: hasMethod ? method : [],
  });

  ok(
    "automatic setup needs a payout account, and only that",
    venueSetupReady(venue("AUTOMATIC", true, false)) &&
      !venueSetupReady(venue("AUTOMATIC", false, true))
  );
  ok(
    "manual setup needs a manual destination, and only that",
    venueSetupReady(venue("MANUAL", false, true)) &&
      !venueSetupReady(venue("MANUAL", true, false))
  );
  ok(
    "automatic checkout also needs the platform account",
    venueCheckoutReady(venue("AUTOMATIC", true, false), true) &&
      !venueCheckoutReady(venue("AUTOMATIC", true, false), false)
  );
  ok(
    "manual checkout does not depend on the platform account",
    venueCheckoutReady(venue("MANUAL", false, true), false)
  );
  ok(
    "the platform account never makes an unfinished venue bookable",
    !venueCheckoutReady(venue("AUTOMATIC", false, false), true) &&
      !venueCheckoutReady(venue("MANUAL", false, false), true)
  );

  const trainer = (
    paymentMode: "AUTOMATIC" | "MANUAL",
    hasAccount: boolean,
    hasMethod: boolean
  ) => ({
    paymentMode,
    user: {
      payoutAccount: hasAccount ? account : null,
      trainerManualMethods: hasMethod ? method : [],
    },
  });
  ok(
    "a trainer follows the same rules as a venue",
    trainerSetupReady(trainer("AUTOMATIC", true, false)) &&
      !trainerSetupReady(trainer("AUTOMATIC", false, true)) &&
      trainerSetupReady(trainer("MANUAL", false, true)) &&
      trainerCheckoutReady(trainer("AUTOMATIC", true, false), true) &&
      !trainerCheckoutReady(trainer("AUTOMATIC", true, false), false) &&
      trainerCheckoutReady(trainer("MANUAL", false, true), false)
  );

  // --- 2. Against a real hub ------------------------------------------------
  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      name: "Readiness Check Venue",
      email: EMAIL,
      passwordHash: "x",
      hubs: {
        create: {
          name: "Readiness Check Venue",
          slug: "check-readiness-partner",
          coverPhotos: [],
          games: ["pickleball"],
          courts: {
            create: { name: "Court 1", courtType: "covered", hourlyRate: 500 },
          },
        },
      },
    },
    select: {
      id: true,
      hubs: { select: { id: true, courts: { select: { id: true } } } },
    },
  });
  const hubId = partner.hubs[0].id;
  const courtId = partner.hubs[0].courts[0].id;

  const { getPublicHub, listPublicHubs } = await import("@/lib/hubs");
  const { getCourtForBooking } = await import("@/lib/bookings");
  const { getPartnerPaymentSetup, isPartnerPaymentReady } = await import(
    "@/lib/manual-payments"
  );
  const { listEventFormHubs } = await import("@/lib/events");
  const listed = async () =>
    (await listPublicHubs()).find((hub) => hub.id === hubId);

  const fresh = await getPublicHub(hubId);
  ok(
    "a new automatic venue is Coming soon until it adds a payout account",
    fresh?.comingSoon === true &&
      fresh.verified === false &&
      fresh.bookable === false &&
      fresh.blockedBy === "gateway" &&
      fresh.publiclyListed === true
  );
  ok(
    "and its court cannot be booked",
    (await getCourtForBooking(courtId))?.hub.bookable === false
  );

  await seedPayoutAccount(prisma, partner.id);
  const ready = await getPublicHub(hubId);
  ok(
    "adding the payout account verifies it and opens booking",
    ready?.verified === true &&
      ready.bookable === true &&
      ready.comingSoon === false &&
      ready.blockedBy === null
  );
  const readySetup = await getPartnerPaymentSetup(partner.id);
  ok(
    "the setup reports the platform's key mode for new payments",
    readySetup.payoutAccountReady &&
      readySetup.automaticReady &&
      readySetup.platformEnvironment === "TEST" &&
      isPartnerPaymentReady(readySetup)
  );
  ok(
    "the directory, the booking gate, and the event form all agree",
    (await listed())?.bookable === true &&
      (await listed())?.verified === true &&
      (await getCourtForBooking(courtId))?.hub.bookable === true &&
      (await listEventFormHubs(partner.id)).find((hub) => hub.id === hubId)
        ?.paymentReady === true
  );

  // --- 3. Bunal.club's own account goes away --------------------------------
  delete process.env.PAYMONGO_SECRET_KEY;
  const paused = await getPublicHub(hubId);
  ok(
    "without the platform account the venue stays verified and listed",
    paused?.verified === true &&
      paused.publiclyListed === true &&
      paused.comingSoon === false
  );
  ok(
    "but booking pauses, and the reason is the platform, not the venue",
    paused?.bookable === false && paused.blockedBy === "platform"
  );
  const pausedSetup = await getPartnerPaymentSetup(partner.id);
  ok(
    "the venue's own setup still reads as complete",
    isPartnerPaymentReady(pausedSetup) &&
      pausedSetup.payoutAccountReady &&
      !pausedSetup.automaticReady
  );
  ok(
    "no court can be booked, and the directory shows it verified but not bookable",
    (await getCourtForBooking(courtId))?.hub.bookable === false &&
      (await listed())?.verified === true &&
      (await listed())?.bookable === false
  );

  // A manual venue is paid directly, so it carries on regardless.
  await prisma.partnerManualPaymentMethod.create({
    data: {
      partnerId: partner.id,
      network: "GCASH",
      label: "GCash",
      accountName: "Readiness Check Venue",
      accountIdentifier: "09170000000",
    },
  });
  await prisma.user.update({
    where: { id: partner.id },
    data: { partnerPaymentMode: "MANUAL" },
  });
  const manual = await getPublicHub(hubId);
  ok(
    "a manual venue stays bookable while the platform account is away",
    manual?.bookable === true &&
      manual.verified === true &&
      manual.blockedBy === null &&
      (await getCourtForBooking(courtId))?.hub.bookable === true
  );

  process.env.PAYMONGO_SECRET_KEY = CHECK_PLATFORM_SECRET_KEY;
  await cleanup();
  ok(
    "the fixture venue is gone",
    (await prisma.user.count({ where: { email: EMAIL } })) === 0
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
