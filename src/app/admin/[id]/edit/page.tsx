import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditUserForm } from "@/components/admin/EditUserForm";
import { requireAdmin, getUserById } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Edit User — Admin — Sports 360",
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
    <main className="min-h-screen bg-white px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <AdminHeader email={admin?.email} />
        <div className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </div>
        <EditUserForm user={user} isSelf={user.id === admin?.id} />
      </div>
    </main>
  );
}
