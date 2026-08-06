// Managed sessions, single-use grants, authenticator MFA, and recovery codes.
//
//   npm run check:account-security
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import {
  authenticatePassword,
  completeMfaSetupChallenge,
  consumeLoginGrant,
  createGoogleLoginSession,
  createLoginGrant,
  createSecurityChallenge,
  getSecurityChallenge,
  setupSecretForChallenge,
  validateManagedSession,
  verifyLoginMfaChallenge,
  verifyMfaSetupChallenge,
} from "@/lib/account-security";
import { loginThrottleKeys, type SecurityRequestContext } from "@/lib/security-context";
import { totpCode } from "@/lib/totp";

const prisma = new PrismaClient();
const EMAIL = "check-account-security@example.test";
const GOOGLE_EMAIL = "check-google-registration@example.test";
const PASSWORD = "account-security-password";
let userId: string | null = null;
let googleUserId: string | null = null;

const context: SecurityRequestContext = {
  deviceHash: "check-device-hash",
  deviceLabel: "Security check browser",
  browser: "Check browser",
  operatingSystem: "Check OS",
  location: "Check City, PH",
  ipHash: "check-ip-hash",
  ipPrefix: "192.0.2.0/24",
};

async function check() {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, GOOGLE_EMAIL] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      name: "Account security check",
      email: EMAIL,
      passwordHash,
      role: "PLAYER",
    },
    select: { id: true },
  });
  userId = user.id;

  const invalid = await authenticatePassword({
    email: EMAIL,
    password: "incorrect",
    context,
  });
  ok("invalid passwords are rejected", invalid.status === "invalid");

  const authenticated = await authenticatePassword({
    email: EMAIL,
    password: PASSWORD,
    context,
  });
  ok("valid passwords pass primary authentication", authenticated.status === "success");

  const grant = await createLoginGrant({
    userId: user.id,
    mfaVerified: true,
    context,
  });
  const login = await consumeLoginGrant(grant);
  ok("a single-use grant creates a managed session", login?.id === user.id);
  ok("a consumed grant cannot be replayed", (await consumeLoginGrant(grant)) === null);
  ok(
    "the managed session is validated by its hashed registry entry",
    Boolean(
      login &&
        (await validateManagedSession({
          userId: user.id,
          sessionId: login.sessionId,
        }))
    )
  );

  const googleLogin = await createGoogleLoginSession({
    userId: user.id,
    context: { ...context, deviceHash: "google-device-hash" },
  });
  ok(
    "Google login creates the same kind of managed session",
    Boolean(
      googleLogin?.sessionId &&
        (await validateManagedSession({
          userId: user.id,
          sessionId: googleLogin.sessionId,
        }))
    )
  );

  const provisionalGoogleUser = await prisma.user.create({
    data: {
      name: "Google registration check",
      email: GOOGLE_EMAIL,
      registrationCompletedAt: null,
      accounts: {
        create: {
          type: "oidc",
          provider: "google",
          providerAccountId: "check-google-registration",
        },
      },
    },
    select: { id: true },
  });
  googleUserId = provisionalGoogleUser.id;
  const provisionalLogin = await createGoogleLoginSession({
    userId: provisionalGoogleUser.id,
    context,
  });
  ok(
    "incomplete Google registration receives no managed session",
    provisionalLogin?.mfaVerified === false &&
      provisionalLogin.sessionId === undefined
  );
  await prisma.user.update({
    where: { id: provisionalGoogleUser.id },
    data: {
      registrationCompletedAt: new Date(),
    },
  });
  const completedGoogleLogin = await createGoogleLoginSession({
    userId: provisionalGoogleUser.id,
    context,
  });
  ok(
    "completed Google registration receives a managed session",
    Boolean(completedGoogleLogin?.sessionId)
  );

  const setupToken = await createSecurityChallenge({
    userId: user.id,
    purpose: "ACCOUNT_MFA_SETUP",
  });
  const setupChallenge = await getSecurityChallenge(setupToken);
  const secret = await setupSecretForChallenge(setupChallenge);
  ok("MFA setup stores an encrypted authenticator secret", Boolean(secret));
  const setup = await verifyMfaSetupChallenge({
    token: setupToken,
    code: totpCode(secret!),
    currentPassword: PASSWORD,
    context,
  });
  ok("a valid TOTP enables MFA", setup.status === "verified");
  if (setup.status !== "verified") throw new Error("MFA setup failed");
  ok("ten recovery codes are issued", setup.recoveryCodes.length === 10);
  const setupReplay = await verifyMfaSetupChallenge({
    token: setupToken,
    code: totpCode(secret!),
    currentPassword: PASSWORD,
    context,
  });
  ok(
    "a verified setup challenge cannot issue codes twice",
    setupReplay.status === "expired"
  );
  ok(
    "setup remains pending until recovery codes are acknowledged",
    await completeMfaSetupChallenge({ token: setupToken, userId: user.id })
  );
  ok(
    "an acknowledged setup challenge is consumed",
    (await getSecurityChallenge(setupToken)) === null
  );

  const deferredGoogleLogin = await createGoogleLoginSession({
    userId: user.id,
    context,
  });
  ok(
    "Google login defers managed-session creation when MFA is enabled",
    deferredGoogleLogin?.mfaVerified === false &&
      deferredGoogleLogin.sessionId === undefined
  );

  const loginChallengeToken = await createSecurityChallenge({
    userId: user.id,
    purpose: "LOGIN_MFA",
  });
  const verified = await verifyLoginMfaChallenge({
    token: loginChallengeToken,
    code: totpCode(secret!),
    useRecoveryCode: false,
    context,
  });
  ok("a valid authenticator code completes login MFA", verified.status === "verified");

  const recoveryChallengeToken = await createSecurityChallenge({
    userId: user.id,
    purpose: "LOGIN_MFA",
  });
  const recovery = await verifyLoginMfaChallenge({
    token: recoveryChallengeToken,
    code: setup.recoveryCodes[0],
    useRecoveryCode: true,
    context,
  });
  ok("an unused recovery code completes login MFA", recovery.status === "verified");

  const replayChallengeToken = await createSecurityChallenge({
    userId: user.id,
    purpose: "LOGIN_MFA",
  });
  const replay = await verifyLoginMfaChallenge({
    token: replayChallengeToken,
    code: setup.recoveryCodes[0],
    useRecoveryCode: true,
    context,
  });
  ok("a recovery code cannot be reused", replay.status === "invalid");
}

async function cleanup() {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (googleUserId) {
    await prisma.user.deleteMany({ where: { id: googleUserId } });
  }
  const keys = loginThrottleKeys(EMAIL, context.ipHash);
  await prisma.loginThrottle.deleteMany({
    where: { keyHash: { in: [keys.accountIp, keys.ip] } },
  });
  await prisma.$disconnect();
}

run(check, cleanup);
