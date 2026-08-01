"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { verifySession } from "@/lib/dal";
import { changeUserPassword } from "@/lib/password-change";
import { ChangePasswordSchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";

export type PasswordChangeFormState = {
  errors?: Record<string, string>;
  message?: string;
};

export async function changePasswordAction(
  _previous: PasswordChangeFormState,
  formData: FormData
): Promise<PasswordChangeFormState> {
  const { userId } = await verifySession();
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error) };
  }

  const result = await changeUserPassword({
    userId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (result.status === "incorrect") {
    return { errors: { currentPassword: "Current password is incorrect" } };
  }
  if (result.status === "same") {
    return {
      errors: {
        newPassword: "Choose a password different from your current password",
      },
    };
  }
  if (result.status === "unavailable") {
    return {
      message: "This account does not have a password that can be changed.",
    };
  }
  if (result.status === "retry") {
    return {
      message: "Your password changed in another session. Refresh and try again.",
    };
  }

  // The database update invalidated every old JWT. Re-authenticate this
  // browser with the new credentials so it receives the new session version.
  try {
    await signIn("credentials", {
      email: result.email,
      password: parsed.data.newPassword,
      redirectTo: "/dashboard/account?password=changed",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?password=changed");
    }
    throw error;
  }

  return {};
}
