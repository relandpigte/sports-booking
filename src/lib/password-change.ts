import "server-only";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";

export type PasswordChangeResult =
  | { status: "changed"; email: string }
  | { status: "incorrect" }
  | { status: "same" }
  | { status: "unavailable" }
  | { status: "retry" };

export async function changeUserPassword({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user?.passwordHash) return { status: "unavailable" };

  const currentPasswordMatches = await bcrypt.compare(
    currentPassword,
    user.passwordHash
  );
  if (!currentPasswordMatches) return { status: "incorrect" };

  const reusesCurrentPassword = await bcrypt.compare(
    newPassword,
    user.passwordHash
  );
  if (reusesCurrentPassword) return { status: "same" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const changed = await prisma.$transaction(async (tx) => {
    // Match the hash we verified so two simultaneous password changes cannot
    // silently overwrite one another.
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) return false;

    // A reset link issued before this authenticated change must not remain a
    // second way to replace the newly chosen password.
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return true;
  });

  return changed
    ? { status: "changed", email: user.email }
    : { status: "retry" };
}
