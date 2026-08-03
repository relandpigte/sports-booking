// Successful-login telemetry is atomic and available for every user role.
//
//   npm run check:login-security
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { recordSuccessfulLogin } from "@/lib/login-security";

const prisma = new PrismaClient();
const EMAIL = "check-login-security@example.test";
let userId: string | null = null;

async function check() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: "Login security check",
      email: EMAIL,
      passwordHash: "not-used-by-this-check",
      role: "PLAYER",
    },
    select: { id: true },
  });
  userId = user.id;

  await Promise.all(
    Array.from({ length: 8 }, () => recordSuccessfulLogin(user.id))
  );
  const recorded = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { loginCount: true, lastLoginAt: true },
  });

  ok(
    "concurrent successful logins increment without lost updates",
    recorded.loginCount === 8
  );
  ok(
    "a successful login stores its timestamp",
    recorded.lastLoginAt != null
  );
}

async function cleanup() {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}

run(check, cleanup);
