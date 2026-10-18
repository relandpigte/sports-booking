import "server-only";

import { FullNameSchema, hasAccountName } from "@/lib/account-name-shared";
import { prisma } from "@/lib/db";

export { FullNameSchema, hasAccountName } from "@/lib/account-name-shared";

// Older accounts could be created without a name. Registration and booking
// forms show a "fullName" field for those accounts; this saves it before the
// action continues, or returns the field error to show. Accounts that already
// have a name are left untouched. The stored row decides, not the caller's
// copy of the user.
export async function ensureAccountName(
  user: { id: string },
  formData: FormData
): Promise<{ errors: { fullName: string } } | null> {
  const stored = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, playerName: true },
  });
  if (!stored || hasAccountName(stored)) return null;
  const parsed = FullNameSchema.safeParse(
    String(formData.get("fullName") ?? "")
  );
  if (!parsed.success) {
    return {
      errors: {
        fullName: parsed.error.issues[0]?.message ?? "Enter your full name",
      },
    };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data },
  });
  return null;
}
