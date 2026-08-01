// Authenticated password changes verify the current credential, reject reuse,
// clear outstanding reset links, and invalidate existing sessions.
//
//   npm run check:password-change
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { changeUserPassword } from "@/lib/password-change";

const prisma = new PrismaClient();
const EMAIL = "check-password-change@example.test";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function check() {
  await cleanup();

  const originalHash = await bcrypt.hash("old-password", 10);
  const user = await prisma.user.create({
    data: {
      name: "Password Change Check",
      email: EMAIL,
      passwordHash: originalHash,
      passwordResetToken: {
        create: {
          emailHash: "password-change-check-email",
          tokenHash: "password-change-check-token",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      },
    },
    select: { id: true },
  });

  const incorrect = await changeUserPassword({
    userId: user.id,
    currentPassword: "wrong-password",
    newPassword: "new-password",
  });
  ok("an incorrect current password is rejected", incorrect.status === "incorrect");

  const afterIncorrect = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, sessionVersion: true },
  });
  ok(
    "a rejected change leaves the password untouched",
    Boolean(
      afterIncorrect.passwordHash &&
        (await bcrypt.compare("old-password", afterIncorrect.passwordHash))
    )
  );
  ok(
    "a rejected change leaves sessions valid",
    afterIncorrect.sessionVersion === 0
  );

  const reused = await changeUserPassword({
    userId: user.id,
    currentPassword: "old-password",
    newPassword: "old-password",
  });
  ok("the current password cannot be reused", reused.status === "same");

  const changed = await changeUserPassword({
    userId: user.id,
    currentPassword: "old-password",
    newPassword: "new-password",
  });
  ok("a valid password change succeeds", changed.status === "changed");

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      passwordHash: true,
      sessionVersion: true,
      passwordResetToken: { select: { id: true } },
    },
  });
  ok(
    "the replacement password is stored as a bcrypt hash",
    Boolean(
      updated.passwordHash &&
        (await bcrypt.compare("new-password", updated.passwordHash))
    )
  );
  ok("existing sessions are invalidated", updated.sessionVersion === 1);
  ok("outstanding reset links are invalidated", !updated.passwordResetToken);
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
