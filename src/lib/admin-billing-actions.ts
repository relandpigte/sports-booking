"use server";

import { revalidatePath } from "next/cache";

import {
  compPeriod,
  createAdminPaymentLink,
  recordOfflinePayment,
} from "@/lib/admin-billing";

export type AdminBillingFormState = {
  message?: string;
  success?: string;
  // The checkout to send the partner. Rendered as a copyable field rather than
  // a redirect — the admin isn't the one paying.
  checkoutUrl?: string;
};

function revalidateAdminBilling(userId?: string) {
  revalidatePath("/dashboard/admin/subscriptions");
  revalidatePath("/dashboard/admin");
  // Their own billing page shows the same ledger.
  if (userId) revalidatePath("/dashboard/billing");
  revalidatePath("/hubs");
}

export async function createPaymentLinkAction(
  _prev: AdminBillingFormState,
  formData: FormData
): Promise<AdminBillingFormState> {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { message: "No partner selected." };

  // requireAdmin lives inside the DAL, so a crafted post is refused there.
  const result = await createAdminPaymentLink(userId);
  revalidateAdminBilling(userId);

  if (!result.ok) return { message: result.message };
  return {
    checkoutUrl: result.checkoutUrl,
    success: result.reused
      ? "A payment was already open for this period — here's the same link."
      : "Send this to the partner. It settles the moment they pay.",
  };
}

export async function recordOfflinePaymentAction(
  _prev: AdminBillingFormState,
  formData: FormData
): Promise<AdminBillingFormState> {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { message: "No partner selected." };

  const result = await recordOfflinePayment({
    userId,
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidateAdminBilling(userId);
  return result.ok ? { success: result.message } : { message: result.message };
}

export async function compPeriodAction(
  _prev: AdminBillingFormState,
  formData: FormData
): Promise<AdminBillingFormState> {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { message: "No partner selected." };

  const result = await compPeriod({
    userId,
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidateAdminBilling(userId);
  return result.ok ? { success: result.message } : { message: result.message };
}
