// Admin user management: compact server pagination and role/search filters.
//
//   npm run check:admin-users
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";

const prisma = new PrismaClient();
const EMAIL_PREFIX = "check-admin-page-";
const ADMIN_EMAIL = `${EMAIL_PREFIX}admin@example.test`;

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
}

async function check() {
  await cleanup();
  const admin = await prisma.user.create({
    data: {
      name: "Pagination Admin",
      email: ADMIN_EMAIL,
      role: "ADMIN",
    },
    select: { id: true, email: true, role: true },
  });
  await prisma.user.createMany({
    data: Array.from({ length: 23 }, (_, index) => ({
      name: `Pagination Player ${String(index + 1).padStart(2, "0")}`,
      email: `${EMAIL_PREFIX}${index + 1}@example.test`,
      role: "PLAYER" as const,
    })),
  });
  const trainerUser = await prisma.user.findUniqueOrThrow({
    where: { email: `${EMAIL_PREFIX}1@example.test` },
    select: { id: true },
  });
  await prisma.trainerProfile.create({
    data: {
      userId: trainerUser.id,
      status: "PENDING",
      sports: ["pickleball"],
      specialties: ["beginner coaching"],
    },
  });

  stubRequestContext(admin, { stubAdminModule: false });
  const { ADMIN_USERS_PAGE_SIZE, listUsers } = await import("@/lib/admin");
  const firstPage = await listUsers({ query: EMAIL_PREFIX, page: 1 });
  ok(
    "the first user page is capped at twenty rows",
    ADMIN_USERS_PAGE_SIZE === 20 &&
      firstPage.total === 24 &&
      firstPage.items.length === 20 &&
      firstPage.pageCount === 2
  );
  const secondPage = await listUsers({ query: EMAIL_PREFIX, page: 2 });
  ok(
    "the second page contains the remaining users",
    secondPage.page === 2 && secondPage.items.length === 4
  );
  const clamped = await listUsers({ query: EMAIL_PREFIX, page: 99 });
  ok("out-of-range pages clamp to the final page", clamped.page === 2);
  const players = await listUsers({
    query: EMAIL_PREFIX,
    role: "PLAYER",
    page: 1,
  });
  ok(
    "role filters are applied before pagination",
    players.total === 23 && players.items.every((user) => user.role === "PLAYER")
  );
  const trainers = await listUsers({
    query: EMAIL_PREFIX,
    trainerOnly: true,
    trainerStatus: "PENDING",
    page: 1,
  });
  ok(
    "trainer capability and status filters are exposed in user management",
    trainers.total === 1 &&
      trainers.items[0]?.trainerStatus === "PENDING" &&
      trainers.items[0]?.role === "PLAYER"
  );
  const searched = await listUsers({ query: "Pagination Admin", page: 1 });
  ok(
    "name search is applied on the server",
    searched.total === 1 && searched.items[0]?.email === ADMIN_EMAIL
  );

  const emptyPartner = await prisma.user.create({
    data: {
      name: "Empty Partner",
      email: `${EMAIL_PREFIX}empty-partner@example.test`,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true },
  });
  const establishedPartner = await prisma.user.create({
    data: {
      name: "Established Partner",
      email: `${EMAIL_PREFIX}established-partner@example.test`,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      hubs: {
        create: {
          name: "Protected Venue",
          coverPhotos: [],
          games: ["pickleball"],
        },
      },
    },
    select: { id: true },
  });
  const { deleteUserAction, setPartnerActiveAction } =
    await import("@/lib/admin-actions");

  const activeDelete = new FormData();
  activeDelete.set("userId", emptyPartner.id);
  const activeDeleteResult = await deleteUserAction({}, activeDelete);
  ok(
    "an active partner must be deactivated before deletion",
    activeDeleteResult.message?.includes("Deactivate") === true &&
      (await prisma.user.count({ where: { id: emptyPartner.id } })) === 1
  );

  for (const userId of [emptyPartner.id, establishedPartner.id]) {
    const deactivate = new FormData();
    deactivate.set("userId", userId);
    deactivate.set("active", "false");
    await setPartnerActiveAction(deactivate);
  }
  const deactivated = await prisma.user.findMany({
    where: { id: { in: [emptyPartner.id, establishedPartner.id] } },
    select: { partnerStatus: true },
  });
  ok(
    "deactivation uses a distinct partner status",
    deactivated.every((partner) => partner.partnerStatus === "DEACTIVATED")
  );

  const emptyDelete = new FormData();
  emptyDelete.set("userId", emptyPartner.id);
  const emptyDeleteResult = await deleteUserAction({}, emptyDelete);
  ok(
    "a deactivated partner with no domain history can be deleted",
    emptyDeleteResult.message === undefined &&
      (await prisma.user.count({ where: { id: emptyPartner.id } })) === 0
  );

  const protectedDelete = new FormData();
  protectedDelete.set("userId", establishedPartner.id);
  const protectedDeleteResult = await deleteUserAction({}, protectedDelete);
  ok(
    "venue history prevents permanent partner deletion",
    protectedDeleteResult.message?.includes("history") === true &&
      (await prisma.user.count({ where: { id: establishedPartner.id } })) === 1
  );
  const protectedList = await listUsers({
    query: `${EMAIL_PREFIX}established-partner`,
    role: "PARTNER",
    page: 1,
  });
  ok(
    "the admin list explains why protected partners cannot be deleted",
    protectedList.items[0]?.deleteBlockedReason?.includes("history") === true
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
