import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/AuthLayout";
import { PartnerRegisterForm } from "@/components/billing/PartnerRegisterForm";
import { listPlans } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Partner Registration — Bunal.ph",
};

// Server wrapper: the plans come from the database so pricing can change
// without a deploy. The form itself is a Client Component.
export default async function PartnerRegisterPage() {
  const plans = await listPlans();

  return (
    <AuthLayout
      title="List your venue"
      subtitle="Take bookings online, get paid directly, and keep your courts full."
      width="max-w-2xl"
    >
      <>
        <PartnerRegisterForm plans={plans} />

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            Log in
          </Link>
        </p>
        <p className="mt-1.5 text-center text-sm text-gray-400">
          Just here to play?{" "}
          <Link
            href="/register"
            className="font-medium text-navy hover:underline"
          >
            Register as a player
          </Link>
        </p>
      </>
    </AuthLayout>
  );
}
