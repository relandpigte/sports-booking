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
  const searched = await listUsers({ query: "Pagination Admin", page: 1 });
  ok(
    "name search is applied on the server",
    searched.total === 1 && searched.items[0]?.email === ADMIN_EMAIL
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
