// Password-reset tokens are expiring, single-use, and invalidate old sessions.
//
//   npm run check:password-reset
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import {
  passwordResetTokenHash,
  passwordResetTokenIsValid,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/password-reset";

const prisma = new PrismaClient();
const EMAIL = "check-password-reset@example.test";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function check() {
  await cleanup();

  const originalHash = await bcrypt.hash("old-password", 10);
  const user = await prisma.user.create({
    data: {
      name: "Password Reset Check",
      email: EMAIL,
      passwordHash: originalHash,
    },
    select: { id: true },
  });

  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  let sends = 0;
  let sdkUserAgent = false;
  let idempotencyHeader = false;
  let renderedResetLink = false;
  let renderedBrandLogo = false;
  let renderedEmailSafeShell = false;
  process.env.RESEND_API_KEY = "re_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  globalThis.fetch = (async (_input, init) => {
    sends++;
    const headers = new Headers(init?.headers);
    sdkUserAgent = Boolean(headers.get("User-Agent"));
    idempotencyHeader = Boolean(headers.get("Idempotency-Key"));
    renderedResetLink = String(init?.body).includes("reset-password?token=");
    renderedBrandLogo = String(init?.body).includes(
      "bunal-logo-v2-wordmark.png"
    );
    renderedEmailSafeShell = String(init?.body).includes(
      'role=\\"presentation\\"'
    );
    return new Response(JSON.stringify({ id: "email-check" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const firstRequest = await requestPasswordReset(EMAIL);
    const secondRequest = await requestPasswordReset(EMAIL);
    ok("configured reset requests are accepted", firstRequest.configured);
    ok(
      "throttled requests keep the same account-neutral response",
      secondRequest.configured
    );
    ok("repeat requests inside the cooldown send one email", sends === 1);
    ok("the Resend SDK supplies its required user agent", sdkUserAgent);
    ok("the SDK sends the reset request idempotently", idempotencyHeader);
    ok("the email body contains the secure reset link", renderedResetLink);
    ok("the reset email contains the Bunal.club logo", renderedBrandLogo);
    ok("the reset email uses an email-safe table shell", renderedEmailSafeShell);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      emailHash: crypto.createHash("sha256").update(EMAIL).digest("hex"),
      tokenHash: passwordResetTokenHash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  ok("a fresh token is accepted", await passwordResetTokenIsValid(token));
  ok(
    "the token resets the password",
    await resetPasswordWithToken({ token, password: "new-password" })
  );

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, sessionVersion: true },
  });
  ok(
    "the new password is stored as a bcrypt hash",
    Boolean(
      updated.passwordHash &&
        (await bcrypt.compare("new-password", updated.passwordHash))
    )
  );
  ok("existing sessions are invalidated", updated.sessionVersion === 1);
  ok("the used token is deleted", !(await passwordResetTokenIsValid(token)));
  ok(
    "a used token cannot be replayed",
    !(await resetPasswordWithToken({ token, password: "replayed-password" }))
  );

  const expiredToken = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      emailHash: crypto
        .createHash("sha256")
        .update(`${EMAIL}:expired`)
        .digest("hex"),
      tokenHash: passwordResetTokenHash(expiredToken),
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  ok(
    "an expired token is rejected",
    !(await resetPasswordWithToken({
      token: expiredToken,
      password: "expired-password",
    }))
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
