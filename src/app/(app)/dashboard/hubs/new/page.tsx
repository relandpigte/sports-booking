import type { Metadata } from "next";
import Link from "next/link";
import { HubForm } from "@/components/dashboard/hubs/HubForm";
import { requireActivePartner } from "@/lib/dal";

export const metadata: Metadata = {
  title: "New Hub — Bunal.ph",
};

export default async function NewHubPage() {
  await requireActivePartner();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/dashboard/hubs"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to hubs
      </Link>
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-gray-900">Create Hub</h1>
        <p className="mt-1 text-sm text-gray-500">
          Add your venue&apos;s details, photos, and operating hours.
        </p>
      </div>
      <HubForm />
    </div>
  );
}
