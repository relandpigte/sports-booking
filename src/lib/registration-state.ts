import type { Role } from "@prisma/client";

export type RegistrationStateInput = {
  role: Role;
  registrationCompletedAt: Date | null;
  passwordHash: string | null;
  accounts: Array<{ provider: string }>;
};

export function isIncompleteGoogleRegistration(
  user: RegistrationStateInput
): boolean {
  const googleOnly =
    user.passwordHash === null &&
    user.accounts.some((account) => account.provider === "google");
  return googleOnly && user.registrationCompletedAt === null;
}

export function registrationFullName(user: {
  name: string | null;
  playerName: string | null;
}): string {
  return user.playerName?.trim() || user.name?.trim() || "";
}
