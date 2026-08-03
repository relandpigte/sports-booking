import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditUserForm } from "@/components/admin/EditUserForm";
import {
  requireAdmin,
  getUserById,
  listPartnerAssistanceAudit,
} from "@/lib/admin";
import { startPartnerImpersonationAction } from "@/lib/impersonation-actions";

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
  const assistanceAudit =
    user.role === "PARTNER" ? await listPartnerAssistanceAudit(user.id) : [];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/users"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to users
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </div>
        {user.role === "PARTNER" && (
          <form action={startPartnerImpersonationAction}>
            <input type="hidden" name="partnerId" value={user.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-xl bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-950"
            >
              Assist as partner
            </button>
          </form>
        )}
      </div>
      <EditUserForm user={user} isSelf={user.id === admin?.id} />
      {user.role === "PARTNER" && (
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-bold text-gray-900">Assistance history</h2>
            <p className="mt-1 text-sm text-gray-500">
              The latest admin-assisted sessions and operational changes for
              this partner.
            </p>
          </div>
          {assistanceAudit.length > 0 ? (
            <ol className="mt-4 divide-y divide-gray-100">
              {assistanceAudit.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatAuditAction(entry.action)}
                    </p>
                    <time className="text-xs text-gray-500">
                      {formatAuditDate(entry.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {entry.admin?.name ?? entry.admin?.email ?? entry.adminId}
                    {entry.targetType && entry.targetId
                      ? ` · ${entry.targetType} ${entry.targetId}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No assisted sessions yet.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function formatAuditAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAuditDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}
