import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubForm } from "@/components/dashboard/hubs/HubForm";
import { getMyHub } from "@/lib/hubs";

export const metadata: Metadata = {
  title: "Edit Hub — Sports 360",
};

export default async function EditHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hub = await getMyHub(id);

  if (!hub) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/dashboard/hubs"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to hubs
      </Link>
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-gray-900">Edit Hub</h1>
        <p className="mt-1 text-sm text-gray-500">{hub.name}</p>
      </div>
      <HubForm hub={hub} />
    </div>
  );
}
