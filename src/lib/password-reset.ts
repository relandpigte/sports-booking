import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  passwordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/email";
import { appUrl } from "@/lib/urls";

export const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
const MIN_REQUEST_DURATION_MS = 500;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function passwordResetTokenHash(token: string): string {
  return sha256(token);
}

function emailHash(email: string): string {
  return sha256(email);
}

function validTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

async function waitForUniformResponse(startedAt: number): Promise<void> {
  const remaining = MIN_REQUEST_DURATION_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export async function requestPasswordReset(email: string): Promise<{
  configured: boolean;
}> {
  const startedAt = Date.now();
  if (!passwordResetEmailConfigured()) {
    await waitForUniformResponse(startedAt);
    return { configured: false };
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000
  );
  const cooldownBefore = new Date(
    now.getTime() - PASSWORD_RESET_COOLDOWN_SECONDS * 1000
  );
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = passwordResetTokenHash(rawToken);
  const normalizedEmailHash = emailHash(email);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true },
  });
  const data = {
    tokenHash,
    userId: user?.id ?? null,
    expiresAt,
    requestedAt: now,
  };

  // Claim a send slot atomically. updateMany's requestedAt predicate means two
  // simultaneous requests for the same address cannot both send an email.
  let claimed =
    (
      await prisma.passwordResetToken.updateMany({
        where: {
          emailHash: normalizedEmailHash,
          requestedAt: { lt: cooldownBefore },
        },
        data,
      })
    ).count === 1;

  if (!claimed) {
    const inserted = await prisma.$executeRaw`
      INSERT INTO "PasswordResetToken"
        ("id", "emailHash", "tokenHash", "userId", "expiresAt", "requestedAt")
      VALUES
        (${crypto.randomUUID()}, ${normalizedEmailHash}, ${tokenHash}, ${user?.id ?? null}, ${expiresAt}, ${now})
      ON CONFLICT DO NOTHING
    `;
    claimed = inserted === 1;
  }

  if (claimed && user?.passwordHash) {
    const resetUrl = appUrl(
      `/reset-password?token=${encodeURIComponent(rawToken)}`
    );
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        idempotencyKey: `password-reset-${tokenHash}`,
      });
    } catch (error) {
      // Do not reveal provider errors or account existence to the requester.
      // Keep the request row so provider failures cannot bypass the cooldown;
      // the next request after the cooldown replaces the undelivered token.
      console.error(
        "Password-reset email delivery failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  await waitForUniformResponse(startedAt);
  return { configured: true };
}

export async function passwordResetTokenIsValid(
  token: string
): Promise<boolean> {
  if (!validTokenShape(token)) return false;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: passwordResetTokenHash(token) },
    select: { userId: true, expiresAt: true },
  });
  return Boolean(record?.userId && record.expiresAt > new Date());
}

class InvalidResetTokenError extends Error {}

export async function resetPasswordWithToken({
  token,
  password,
}: {
  token: string;
  password: string;
}): Promise<boolean> {
  if (!validTokenShape(token)) return false;

  const tokenHash = passwordResetTokenHash(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!record?.userId || record.expiresAt <= new Date()) return false;

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.deleteMany({
        where: {
          id: record.id,
          tokenHash,
          expiresAt: { gt: new Date() },
        },
      });
      if (claimed.count !== 1) throw new InvalidResetTokenError();

      await tx.user.update({
        where: { id: record.userId! },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });

      // Defensive cleanup if old data ever contains more than one token.
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.userId },
      });
    });
  } catch (error) {
    if (
      error instanceof InvalidResetTokenError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025")
    ) {
      return false;
    }
    throw error;
  }

  return true;
}
