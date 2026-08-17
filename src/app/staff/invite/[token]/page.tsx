import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthLayout } from "@/components/AuthLayout";
import { AcceptStaffInvitationForm } from "@/components/staff/AcceptStaffInvitationForm";
import { getAuthenticatedUser } from "@/lib/dal";
import { getStaffInvitationView } from "@/lib/staffing-actions";
import { permissionSummary } from "@/lib/staffing";

export const metadata: Metadata = { title: "Staff invitation — Bunal.club" };

export default async function StaffInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, actor] = await Promise.all([
    getStaffInvitationView(token),
    getAuthenticatedUser(),
  ]);
  if (!invitation) notFound();
  const next = `/staff/invite/${token}`;
  return (
    <AuthLayout
      title={`Join ${invitation.partnerName}`}
      subtitle={`You were invited to help manage this venue account as ${invitation.email}.`}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
          Staff access
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {permissionSummary(invitation.permissions).map((permission) => (
            <li key={permission}>• {permission}</li>
          ))}
        </ul>
        {!invitation.active ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This venue account is not currently active.
          </p>
        ) : actor ? (
          <AcceptStaffInvitationForm token={token} />
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-white"
            >
              Log in
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`}
              className="rounded-xl border border-navy px-4 py-3 text-center text-sm font-bold text-navy"
            >
              Create player account
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
