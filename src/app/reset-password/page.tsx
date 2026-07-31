import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { passwordResetTokenIsValid } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Choose a new password | Bunal.club",
  description: "Choose a new password for your Bunal.club account.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const value = (await searchParams).token;
  const token = typeof value === "string" ? value : "";
  const valid = await passwordResetTokenIsValid(token);

  return (
    <AuthLayout
      title={valid ? "Choose a new password" : "Reset link unavailable"}
      subtitle={
        valid
          ? "Use a password you don't use on another account."
          : "This password reset link is invalid, expired, or already used."
      }
    >
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6">
          <p className="text-sm leading-relaxed text-gray-500">
            Request a fresh link and use it within 30 minutes. Only the newest
            link will work.
          </p>
          <Link
            href="/forgot-password"
            className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Request a new reset link
          </Link>
          <Link
            href="/login"
            className="mt-3 block text-center text-sm font-medium text-gray-500 hover:text-navy"
          >
            Back to login
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
