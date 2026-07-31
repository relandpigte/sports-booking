import type { Metadata } from "next";
import Link from "next/link";

import { PartnerOnboardingLayout } from "@/components/partner/PartnerOnboardingLayout";
import { PartnerRegisterForm } from "@/components/partner/PartnerRegisterForm";

export const metadata: Metadata = {
  title: "Partner Registration — Bunal.club",
};

export default async function PartnerRegisterPage() {
  return (
    <PartnerOnboardingLayout>
      <>
        <PartnerRegisterForm />

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
    </PartnerOnboardingLayout>
  );
}
