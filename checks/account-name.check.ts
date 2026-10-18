// Every player account carries a name, so rosters and bookings never fall
// back to a generic "Player": sign-up and account settings require one, and
// older nameless accounts add it when they register for an event or book.
//
//   npm run check:account-name
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { hasAccountName } from "@/lib/account-name-shared";
import { PlayerRegisterSchema, ProfileSchema } from "@/lib/validation";

const prisma = new PrismaClient();
const emails = [
  "check-account-name-blank@example.test",
  "check-account-name-named@example.test",
];

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

async function check() {
  await cleanup();

  ok(
    "player sign-up requires a full name",
    !PlayerRegisterSchema.safeParse({
      email: "new-player@example.test",
      password: "a-long-enough-password",
    }).success &&
      !PlayerRegisterSchema.safeParse({
        name: " ",
        email: "new-player@example.test",
        password: "a-long-enough-password",
      }).success &&
      PlayerRegisterSchema.safeParse({
        name: "Juan dela Cruz",
        email: "new-player@example.test",
        password: "a-long-enough-password",
      }).success
  );
  ok(
    "account settings cannot clear the full name",
    !ProfileSchema.safeParse({
      name: "",
      skillLevel: "beginner",
      privateProfile: false,
    }).success
  );
  ok(
    "a player name alone is enough to be recognized",
    hasAccountName({ name: null, playerName: "JD" }) &&
      hasAccountName({ name: "Juan", playerName: null }) &&
      !hasAccountName({ name: " ", playerName: "" })
  );

  const [blank, named] = await prisma.$transaction([
    prisma.user.create({
      data: { email: emails[0], role: "PLAYER" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: emails[1], role: "PLAYER", name: "Already Named" },
      select: { id: true },
    }),
  ]);

  stubRequestContext({ id: blank.id, email: emails[0], role: "PLAYER" });
  const { ensureAccountName } = await import("@/lib/account-name");

  const missing = await ensureAccountName(blank, new FormData());
  ok(
    "a nameless account is asked for its name before continuing",
    missing?.errors.fullName === "Enter your full name"
  );

  const form = new FormData();
  form.set("fullName", "  Maria Santos  ");
  const saved = await ensureAccountName(blank, form);
  const blankAfter = await prisma.user.findUniqueOrThrow({
    where: { id: blank.id },
    select: { name: true },
  });
  ok(
    "the name given while registering is saved to the account",
    saved === null && blankAfter.name === "Maria Santos"
  );

  const overwrite = new FormData();
  overwrite.set("fullName", "Someone Else");
  const untouched = await ensureAccountName(named, overwrite);
  const namedAfter = await prisma.user.findUniqueOrThrow({
    where: { id: named.id },
    select: { name: true },
  });
  ok(
    "an account that already has a name is never renamed by a form",
    untouched === null && namedAfter.name === "Already Named"
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
