import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "New User — Admin — Sports 360",
};

export default async function NewUserPage() {
  const admin = await requireAdmin();

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <AdminHeader email={admin?.email} />
        <div className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900">Create User</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add a new player or partner. They sign in with the email and
            temporary password you set.
          </p>
        </div>
        <CreateUserForm />
      </div>
    </main>
  );
}
