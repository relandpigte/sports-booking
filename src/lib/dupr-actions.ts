"use server";

import { revalidatePath } from "next/cache";

import { getViewer, verifySession } from "@/lib/dal";
import { DUPR_ID_PATTERN } from "@/lib/dupr";
import { linkDuprAccount, unlinkDuprAccount } from "@/lib/dupr-link";
import { isImpersonationActive } from "@/lib/impersonation";
import { consumeRateLimit } from "@/lib/rate-limit";

export type DuprActionState = {
  message?: string;
  success?: string;
};

function revalidateDuprSurfaces() {
  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/player");
  revalidatePath("/leaderboard");
}

// Connecting proves who owns a DUPR account, so it only ever acts on the real
// signed-in player: never on an assisted account, and never on an id the
// browser supplies. The DUPR ID comes from DUPR's consent page and is checked
// with DUPR before anything is stored.
export async function linkDuprAccountAction(
  _previous: DuprActionState,
  formData: FormData
): Promise<DuprActionState> {
  await verifySession();
  if (await isImpersonationActive()) {
    return { message: "Exit assistance first. Only the player can connect DUPR." };
  }
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Only player accounts can connect DUPR." };
  }
  if (
    !(await consumeRateLimit({
      namespace: "dupr-link",
      subject: viewer.id,
      limit: 10,
      windowSeconds: 60 * 60,
    }))
  ) {
    return { message: "Too many attempts. Try again in an hour." };
  }

  const duprId = String(formData.get("duprId") ?? "").trim().toUpperCase();
  if (!DUPR_ID_PATTERN.test(duprId)) {
    return { message: "DUPR didn't return a valid account. Try connecting again." };
  }

  let result: Awaited<ReturnType<typeof linkDuprAccount>>;
  try {
    result = await linkDuprAccount({ userId: viewer.id, duprId });
  } catch (error) {
    console.error(
      "DUPR link failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return { message: "DUPR is unavailable right now. Try again shortly." };
  }

  switch (result.status) {
    case "linked":
      revalidateDuprSurfaces();
      return { success: "DUPR account connected." };
    case "taken":
      return {
        message:
          "This DUPR account is already connected to another Bunal.club account.",
      };
    case "not-verified":
      return {
        message:
          "DUPR hasn't confirmed this connection. Finish signing in on DUPR, then try again.",
      };
    case "unavailable":
      return { message: "DUPR connection isn't available yet." };
  }
}

export async function disconnectDuprAccountAction(
  _previous: DuprActionState,
  _formData: FormData
): Promise<DuprActionState> {
  await verifySession();
  if (await isImpersonationActive()) {
    return { message: "Exit assistance first. Only the player can disconnect DUPR." };
  }
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Only player accounts can connect DUPR." };
  }
  await unlinkDuprAccount(viewer.id);
  revalidateDuprSurfaces();
  return { success: "DUPR account disconnected." };
}
