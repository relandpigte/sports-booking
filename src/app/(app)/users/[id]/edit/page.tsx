import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditUserForm } from "@/components/admin/EditUserForm";
import { requireAdmin, getUserById } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Edit User — Manage Users — Bunal.club",
};

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = await getUserById(id);

  if (!user) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/users"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to users
      </Link>
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>
      <EditUserForm user={user} isSelf={user.id === admin?.id} />
    </div>
  );
}
