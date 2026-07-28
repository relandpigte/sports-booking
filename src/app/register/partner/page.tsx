import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { PartnerRegisterForm } from "@/components/billing/PartnerRegisterForm";
import { listPlans } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Partner Registration — Sports 360",
};

// Server wrapper: the plans come from the database so pricing can change
// without a deploy. The form itself is a Client Component.
export default async function PartnerRegisterPage() {
  const plans = await listPlans();

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Partner Registration
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              List your venue. Take bookings online.
            </p>
          </div>
        </div>

        <Link href="/login" className="mt-6 block">
          <Button type="button">Already have an account? Log In</Button>
        </Link>
        <p className="mt-3 text-center text-sm text-gray-400">
          Or create a partner account here
        </p>

        <PartnerRegisterForm plans={plans} />

        <p className="mt-6 text-center text-sm text-gray-500">
          Just here to play?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Register as a player
          </Link>
        </p>
      </div>
    </main>
  );
}
