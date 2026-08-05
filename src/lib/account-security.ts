import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { CRYPTO_PURPOSE, decrypt, encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { emailDeliveryConfigured, sendNewDeviceLoginEmail } from "@/lib/email";
import {
  hashSecurityToken,
  loginThrottleKeys,
  type SecurityRequestContext,
} from "@/lib/security-context";
import { appUrl } from "@/lib/urls";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";

export const SECURITY_CHALLENGE_COOKIE = "bunal.security-challenge";
export const LOGIN_GRANT_COOKIE = "bunal.login-grant";

const DUMMY_PASSWORD_HASH =
  "$2b$10$cVrMAWi2KPhzTCRw30i46e2oMNwVvUHc/tQSXXSR.1bZ4/u7gtrmu";
const CHALLENGE_MINUTES = 10;
const GRANT_MINUTES = 5;
const SESSION_DAYS = 30;
const RECOVERY_CODE_COUNT = 10;
const MAX_CHALLENGE_ATTEMPTS = 5;

export type SecurityChallengePurpose =
  | "LOGIN_MFA"
  | "LOGIN_MFA_SETUP"
  | "ACCOUNT_MFA_SETUP";

function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function recoveryCodeHash(code: string): string {
  return hashSecurityToken(`bunal-recovery:${normalizeRecoveryCode(code)}`);
}

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

async function recordSecurityEvent({
  userId,
  type,
  context,
  metadata,
}: {
  userId: string;
  type: string;
  context?: SecurityRequestContext;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.securityEvent.create({
    data: {
      userId,
      type,
      deviceLabel: context?.deviceLabel ?? null,
      location: context?.location ?? null,
      ipHash: context?.ipHash ?? null,
      metadata,
    },
  });
}

async function throttleRowBlocked(keyHash: string, now: Date): Promise<boolean> {
  const row = await prisma.loginThrottle.findUnique({ where: { keyHash } });
  return Boolean(row?.blockedUntil && row.blockedUntil > now);
}

async function registerThrottleFailure({
  keyHash,
  threshold,
  blockMinutes,
}: {
  keyHash: string;
  threshold: number;
  blockMinutes: number;
}): Promise<void> {
  const now = new Date();
  const resetBefore = new Date(now.getTime() - 15 * 60_000);
  await prisma.$transaction(async (tx) => {
    const row = await tx.loginThrottle.findUnique({ where: { keyHash } });
    if (!row || row.windowStartedAt < resetBefore) {
      await tx.loginThrottle.upsert({
        where: { keyHash },
        create: { keyHash, attempts: 1, windowStartedAt: now },
        update: {
          attempts: 1,
          windowStartedAt: now,
          blockedUntil: null,
        },
      });
      return;
    }

    const attempts = row.attempts + 1;
    await tx.loginThrottle.update({
      where: { keyHash },
      data: {
        attempts: { increment: 1 },
        blockedUntil:
          attempts >= threshold ? addMinutes(now, blockMinutes) : row.blockedUntil,
      },
    });
  });
}

export async function authenticatePassword({
  email,
  password,
  context,
}: {
  email: string;
  password: string;
  context: SecurityRequestContext;
}): Promise<
  | { status: "blocked" }
  | { status: "invalid" }
  | {
      status: "success";
      user: {
        id: string;
        email: string;
        name: string | null;
        role: Role;
        mfaEnabledAt: Date | null;
      };
    }
> {
  const now = new Date();
  const keys = loginThrottleKeys(email, context.ipHash);
  const [accountIpBlocked, ipBlocked] = await Promise.all([
    throttleRowBlocked(keys.accountIp, now),
    throttleRowBlocked(keys.ip, now),
  ]);
  if (accountIpBlocked || ipBlocked) return { status: "blocked" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      mfaEnabledAt: true,
    },
  });
  const valid = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH
  );

  if (!user?.passwordHash || !valid) {
    await Promise.all([
      registerThrottleFailure({
        keyHash: keys.accountIp,
        threshold: 5,
        blockMinutes: 15,
      }),
      registerThrottleFailure({
        keyHash: keys.ip,
        threshold: 20,
        blockMinutes: 30,
      }),
      user
        ? recordSecurityEvent({
            userId: user.id,
            type: "LOGIN_FAILED",
            context,
          })
        : Promise.resolve(),
    ]);
    return { status: "invalid" };
  }

  await prisma.loginThrottle.deleteMany({ where: { keyHash: keys.accountIp } });
  return {
    status: "success",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabledAt: user.mfaEnabledAt,
    },
  };
}

export async function createLoginGrant({
  userId,
  mfaVerified,
  context,
}: {
  userId: string;
  mfaVerified: boolean;
  context: SecurityRequestContext;
}): Promise<string> {
  const token = randomToken();
  await prisma.authGrant.create({
    data: {
      tokenHash: hashSecurityToken(token),
      userId,
      mfaVerified,
      ...context,
      expiresAt: addMinutes(new Date(), GRANT_MINUTES),
    },
  });
  return token;
}

export async function consumeLoginGrant(token: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sessionVersion: number;
  sessionId: string;
  mfaVerified: boolean;
} | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = new Date();
  const rawSessionToken = randomToken();
  const result = await prisma.$transaction(async (tx) => {
    const grant = await tx.authGrant.findUnique({
      where: { tokenHash: hashSecurityToken(token) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            sessionVersion: true,
            loginCount: true,
          },
        },
      },
    });
    if (!grant || grant.consumedAt || grant.expiresAt <= now) return null;
    const claimed = await tx.authGrant.updateMany({
      where: { id: grant.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return null;

    const knownDevice = await tx.authSession.count({
      where: { userId: grant.userId, deviceHash: grant.deviceHash },
    });
    const session = await tx.authSession.create({
      data: {
        tokenHash: hashSecurityToken(rawSessionToken),
        userId: grant.userId,
        mfaVerified: grant.mfaVerified,
        deviceHash: grant.deviceHash,
        deviceLabel: grant.deviceLabel,
        browser: grant.browser,
        operatingSystem: grant.operatingSystem,
        location: grant.location,
        ipHash: grant.ipHash,
        ipPrefix: grant.ipPrefix,
        expiresAt: addDays(now, SESSION_DAYS),
      },
    });
    const user = await tx.user.update({
      where: { id: grant.userId },
      data: { lastLoginAt: now, loginCount: { increment: 1 } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
      },
    });
    await tx.securityEvent.create({
      data: {
        userId: grant.userId,
        type: knownDevice === 0 ? "LOGIN_NEW_DEVICE" : "LOGIN_SUCCESS",
        deviceLabel: grant.deviceLabel,
        location: grant.location,
        ipHash: grant.ipHash,
        metadata: { mfaVerified: grant.mfaVerified },
      },
    });
    return {
      ...user,
      sessionDatabaseId: session.id,
      sessionId: rawSessionToken,
      mfaVerified: grant.mfaVerified,
      shouldAlert: knownDevice === 0 && grant.user.loginCount > 0,
      deviceLabel: grant.deviceLabel,
      location: grant.location,
    };
  });

  if (!result) return null;
  if (result.shouldAlert && emailDeliveryConfigured()) {
    try {
      await sendNewDeviceLoginEmail({
        to: result.email,
        name: result.name ?? result.email,
        device: result.deviceLabel,
        location: result.location,
        occurredAt: now,
        securityUrl: appUrl("/dashboard/account?tab=security"),
        idempotencyKey: `new-device-${result.sessionDatabaseId}`,
      });
    } catch (error) {
      console.error(
        "New-device security email delivery failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    sessionVersion: result.sessionVersion,
    sessionId: result.sessionId,
    mfaVerified: result.mfaVerified,
  };
}

// Google sign-ins still use the app's revocable session registry. Users who
// require authenticator MFA receive only a provisional Auth.js JWT here; the
// OAuth completion route starts their existing MFA flow, which creates the
// managed session after the second factor succeeds.
export async function createGoogleLoginSession({
  userId,
  context,
}: {
  userId: string;
  context: SecurityRequestContext;
}): Promise<{
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sessionVersion: number;
  sessionId?: string;
  mfaVerified: boolean;
} | null> {
  const now = new Date();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      sessionVersion: true,
      loginCount: true,
      emailVerified: true,
      mfaEnabledAt: true,
    },
  });
  if (!existing) return null;

  const requiresMfa =
    existing.role === "ADMIN" || existing.mfaEnabledAt !== null;
  if (requiresMfa) {
    if (!existing.emailVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { emailVerified: now },
      });
    }
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      sessionVersion: existing.sessionVersion,
      mfaVerified: false,
    };
  }

  const rawSessionToken = randomToken();
  const result = await prisma.$transaction(async (tx) => {
    const knownDevice = await tx.authSession.count({
      where: { userId: existing.id, deviceHash: context.deviceHash },
    });
    const session = await tx.authSession.create({
      data: {
        tokenHash: hashSecurityToken(rawSessionToken),
        userId: existing.id,
        mfaVerified: true,
        ...context,
        expiresAt: addDays(now, SESSION_DAYS),
      },
    });
    const user = await tx.user.update({
      where: { id: existing.id },
      data: {
        emailVerified: existing.emailVerified ?? now,
        lastLoginAt: now,
        loginCount: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
      },
    });
    await tx.securityEvent.create({
      data: {
        userId: existing.id,
        type: knownDevice === 0 ? "LOGIN_NEW_DEVICE" : "LOGIN_SUCCESS",
        deviceLabel: context.deviceLabel,
        location: context.location,
        ipHash: context.ipHash,
        metadata: { mfaVerified: true, provider: "google" },
      },
    });
    return {
      ...user,
      sessionDatabaseId: session.id,
      shouldAlert: knownDevice === 0 && existing.loginCount > 0,
    };
  });

  if (result.shouldAlert && emailDeliveryConfigured()) {
    try {
      await sendNewDeviceLoginEmail({
        to: result.email,
        name: result.name ?? result.email,
        device: context.deviceLabel,
        location: context.location,
        occurredAt: now,
        securityUrl: appUrl("/dashboard/account?tab=security"),
        idempotencyKey: `new-device-${result.sessionDatabaseId}`,
      });
    } catch (error) {
      console.error(
        "New-device security email delivery failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
    sessionVersion: result.sessionVersion,
    sessionId: rawSessionToken,
    mfaVerified: true,
  };
}

export async function createSecurityChallenge({
  userId,
  purpose,
  redirectTo,
}: {
  userId: string;
  purpose: SecurityChallengePurpose;
  redirectTo?: string | null;
}): Promise<string> {
  const setup = purpose !== "LOGIN_MFA";
  if (setup && !isEncryptionConfigured()) {
    throw new Error("MFA cannot be enabled until ENCRYPTION_KEY is configured");
  }
  const token = randomToken();
  const secretEnc = setup
    ? encrypt(generateTotpSecret(), CRYPTO_PURPOSE.mfaSecret)
    : null;
  await prisma.$transaction([
    prisma.securityChallenge.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.securityChallenge.create({
      data: {
        tokenHash: hashSecurityToken(token),
        userId,
        purpose,
        secretEnc,
        redirectTo,
        expiresAt: addMinutes(new Date(), CHALLENGE_MINUTES),
      },
    }),
  ]);
  return token;
}

export async function getSecurityChallenge(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const challenge = await prisma.securityChallenge.findUnique({
    where: { tokenHash: hashSecurityToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mfaEnabledAt: true,
          mfaSecretEnc: true,
        },
      },
    },
  });
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
  ) {
    return null;
  }
  return challenge;
}

export async function setupSecretForChallenge(
  challenge: Awaited<ReturnType<typeof getSecurityChallenge>>
): Promise<string | null> {
  return challenge?.secretEnc
    ? decrypt(challenge.secretEnc, CRYPTO_PURPOSE.mfaSecret)
    : null;
}

async function challengeFailed(
  challenge: NonNullable<Awaited<ReturnType<typeof getSecurityChallenge>>>,
  context: SecurityRequestContext,
  type: string
): Promise<void> {
  await Promise.all([
    prisma.securityChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    }),
    recordSecurityEvent({ userId: challenge.userId, type, context }),
  ]);
}

export async function verifyLoginMfaChallenge({
  token,
  code,
  useRecoveryCode,
  context,
}: {
  token: string;
  code: string;
  useRecoveryCode: boolean;
  context: SecurityRequestContext;
}): Promise<
  | { status: "invalid" | "expired" }
  | { status: "verified"; grant: string; redirectTo: string }
> {
  const challenge = await getSecurityChallenge(token);
  if (!challenge || challenge.purpose !== "LOGIN_MFA") {
    return { status: "expired" };
  }
  let verified = false;
  if (useRecoveryCode) {
    const claimed = await prisma.mfaRecoveryCode.updateMany({
      where: {
        userId: challenge.userId,
        codeHash: recoveryCodeHash(code),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    verified = claimed.count === 1;
  } else if (challenge.user.mfaSecretEnc) {
    verified = verifyTotp(
      decrypt(challenge.user.mfaSecretEnc, CRYPTO_PURPOSE.mfaSecret),
      code
    );
  }
  if (!verified) {
    await challengeFailed(challenge, context, "MFA_CHALLENGE_FAILED");
    return { status: "invalid" };
  }

  await prisma.securityChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  if (useRecoveryCode) {
    await recordSecurityEvent({
      userId: challenge.userId,
      type: "MFA_RECOVERY_CODE_USED",
      context,
    });
  }
  return {
    status: "verified",
    grant: await createLoginGrant({
      userId: challenge.userId,
      mfaVerified: true,
      context,
    }),
    redirectTo: challenge.redirectTo || "/dashboard",
  };
}

export async function verifyMfaSetupChallenge({
  token,
  code,
  currentPassword,
  context,
}: {
  token: string;
  code: string;
  currentPassword?: string;
  context: SecurityRequestContext;
}): Promise<
  | { status: "invalid" | "expired" | "password" }
  | {
      status: "verified";
      recoveryCodes: string[];
      userId: string;
      redirectTo: string;
    }
> {
  const challenge = await getSecurityChallenge(token);
  if (
    !challenge ||
    challenge.verifiedAt ||
    (challenge.purpose !== "LOGIN_MFA_SETUP" &&
      challenge.purpose !== "ACCOUNT_MFA_SETUP")
  ) {
    return { status: "expired" };
  }
  if (challenge.purpose === "ACCOUNT_MFA_SETUP") {
    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: { passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      !currentPassword ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      return { status: "password" };
    }
  }
  const secret = await setupSecretForChallenge(challenge);
  if (!secret || !verifyTotp(secret, code)) {
    await challengeFailed(challenge, context, "MFA_SETUP_FAILED");
    return { status: "invalid" };
  }

  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: challenge.userId },
      data: { mfaSecretEnc: challenge.secretEnc, mfaEnabledAt: now },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: challenge.userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userId: challenge.userId,
        codeHash: recoveryCodeHash(recoveryCode),
      })),
    }),
    prisma.securityChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt: now },
    }),
    prisma.securityEvent.create({
      data: {
        userId: challenge.userId,
        type: "MFA_ENABLED",
        deviceLabel: context.deviceLabel,
        location: context.location,
        ipHash: context.ipHash,
      },
    }),
  ]);
  return {
    status: "verified",
    recoveryCodes,
    userId: challenge.userId,
    redirectTo: challenge.redirectTo || "/dashboard/account?tab=security",
  };
}

export async function completeMfaSetupChallenge({
  token,
  userId,
}: {
  token: string;
  userId: string;
}): Promise<boolean> {
  const completed = await prisma.securityChallenge.updateMany({
    where: {
      tokenHash: hashSecurityToken(token),
      userId,
      verifiedAt: { not: null },
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  return completed.count === 1;
}

export async function disableMfa({
  userId,
  currentPassword,
  code,
  context,
}: {
  userId: string;
  currentPassword: string;
  code: string;
  context: SecurityRequestContext;
}): Promise<"disabled" | "invalid" | "required" | "unavailable"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, passwordHash: true, mfaSecretEnc: true },
  });
  if (!user?.mfaSecretEnc || !user.passwordHash) return "unavailable";
  if (user.role === "ADMIN") return "required";
  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) return "invalid";
  let codeValid = verifyTotp(
    decrypt(user.mfaSecretEnc, CRYPTO_PURPOSE.mfaSecret),
    code
  );
  if (!codeValid) {
    const recovery = await prisma.mfaRecoveryCode.updateMany({
      where: {
        userId,
        codeHash: recoveryCodeHash(code),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    codeValid = recovery.count === 1;
  }
  if (!codeValid) return "invalid";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabledAt: null,
        mfaSecretEnc: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.securityEvent.create({
      data: {
        userId,
        type: "MFA_DISABLED",
        deviceLabel: context.deviceLabel,
        location: context.location,
        ipHash: context.ipHash,
      },
    }),
  ]);
  return "disabled";
}

export async function validateManagedSession({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string | undefined;
}): Promise<{ id: string; mfaVerified: boolean } | null> {
  if (!sessionId) return null;
  const session = await prisma.authSession.findFirst({
    where: {
      userId,
      tokenHash: hashSecurityToken(sessionId),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, mfaVerified: true, lastSeenAt: true },
  });
  if (!session) return null;
  if (session.lastSeenAt < new Date(Date.now() - 5 * 60_000)) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return { id: session.id, mfaVerified: session.mfaVerified };
}

export async function getSecurityOverview({
  userId,
  currentSessionId,
}: {
  userId: string;
  currentSessionId: string;
}) {
  const now = new Date();
  const [user, sessions, events, currentSession] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        mfaEnabledAt: true,
        _count: {
          select: { mfaRecoveryCodes: { where: { usedAt: null } } },
        },
      },
    }),
    prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        deviceLabel: true,
        location: true,
        ipPrefix: true,
        createdAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        deviceLabel: true,
        location: true,
        createdAt: true,
      },
    }),
    prisma.authSession.findUnique({
      where: { tokenHash: hashSecurityToken(currentSessionId) },
      select: { id: true },
    }),
  ]);
  return {
    role: user.role,
    mfaEnabledAt: user.mfaEnabledAt,
    unusedRecoveryCodes: user._count.mfaRecoveryCodes,
    sessions: sessions.map((session) => ({
      ...session,
      current: session.id === currentSession?.id,
    })),
    events,
  };
}

export async function revokeSession({
  userId,
  sessionDatabaseId,
  context,
}: {
  userId: string;
  sessionDatabaseId: string;
  context: SecurityRequestContext;
}): Promise<boolean> {
  const updated = await prisma.authSession.updateMany({
    where: { id: sessionDatabaseId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 1) {
    await recordSecurityEvent({
      userId,
      type: "SESSION_REVOKED",
      context,
      metadata: { sessionId: sessionDatabaseId },
    });
  }
  return updated.count === 1;
}

export async function revokeSessionByToken({
  userId,
  sessionId,
  context,
}: {
  userId: string;
  sessionId: string;
  context: SecurityRequestContext;
}): Promise<boolean> {
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSecurityToken(sessionId) },
    select: { id: true },
  });
  if (!session) return false;
  return revokeSession({
    userId,
    sessionDatabaseId: session.id,
    context,
  });
}

export async function revokeOtherSessions({
  userId,
  currentSessionId,
  context,
}: {
  userId: string;
  currentSessionId: string;
  context: SecurityRequestContext;
}): Promise<number> {
  const current = await prisma.authSession.findUnique({
    where: { tokenHash: hashSecurityToken(currentSessionId) },
    select: { id: true },
  });
  if (!current) return 0;
  const updated = await prisma.authSession.updateMany({
    where: { userId, id: { not: current.id }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordSecurityEvent({
    userId,
    type: "OTHER_SESSIONS_REVOKED",
    context,
    metadata: { count: updated.count },
  });
  return updated.count;
}

export async function recordPasswordChanged(
  userId: string,
  context: SecurityRequestContext
): Promise<void> {
  await Promise.all([
    prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    recordSecurityEvent({ userId, type: "PASSWORD_CHANGED", context }),
  ]);
}
