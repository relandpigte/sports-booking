"use server";

import { redirect } from "next/navigation";

import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/validation";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/password-reset";
import { firstErrors } from "@/lib/zod-errors";
import { getSecurityRequestContext } from "@/lib/security-context";
import { consumeRateLimit } from "@/lib/rate-limit";

export type PasswordResetFormState = {
  ok?: boolean;
  errors?: Record<string, string>;
  message?: string;
  values?: { email?: string };
};

export async function forgotPasswordAction(
  _previous: PasswordResetFormState,
  formData: FormData
): Promise<PasswordResetFormState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = ForgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return {
      errors: firstErrors(parsed.error),
      values: { email: rawEmail },
    };
  }

  const context = await getSecurityRequestContext();
  if (!(await consumeRateLimit({
    namespace: "password-reset",
    subject: context.ipHash,
    limit: 10,
    windowSeconds: 60 * 60,
  }))) {
    return {
      ok: true,
      message:
        "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.",
    };
  }

  const result = await requestPasswordReset(parsed.data.email);
  if (!result.configured) {
    return {
      message:
        "Password reset email is temporarily unavailable. Please try again later.",
      values: { email: rawEmail },
    };
  }

  return {
    ok: true,
    message:
      "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.",
  };
}

export async function resetPasswordAction(
  _previous: PasswordResetFormState,
  formData: FormData
): Promise<PasswordResetFormState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error) };
  }

  const reset = await resetPasswordWithToken({
    token: parsed.data.token,
    password: parsed.data.password,
  });
  if (!reset) {
    return {
      message:
        "This reset link is invalid or has expired. Request a new link to continue.",
    };
  }

  redirect("/login?reset=success");
}
