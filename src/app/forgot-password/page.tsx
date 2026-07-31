import type { Metadata } from "next";

import { AuthLayout } from "@/components/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password | Bunal.club",
  description: "Request a secure password reset link for your Bunal.club account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a secure reset link."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
