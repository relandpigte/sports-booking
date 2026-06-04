import type { Metadata } from "next";
import Link from "next/link";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "New User — Manage Users — Sports 360",
};

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/users"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to users
      </Link>
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-gray-900">Create User</h1>
        <p className="mt-1 text-sm text-gray-500">
          Add a new player or partner. They sign in with the email and temporary
          password you set.
        </p>
      </div>
      <CreateUserForm />
    </div>
  );
}
