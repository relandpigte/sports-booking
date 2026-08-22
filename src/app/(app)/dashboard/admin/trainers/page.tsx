import type { Metadata } from "next";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { decideTrainerApplicationAction } from "@/lib/trainer-actions";

export const metadata: Metadata = { title: "Trainer Reviews — Bunal.club" };

export default async function AdminTrainersPage() {
  await requireAdmin();
  const profiles = await prisma.trainerProfile.findMany({
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    include: {
      user: {
        select: {
          name: true,
          playerName: true,
          email: true,
          phone: true,
          image: true,
          username: true,
          privateProfile: true,
          trainerGateway: { select: { disconnectedAt: true } },
          trainerManualMethods: { where: { active: true }, select: { id: true } },
        },
      },
      weeklyRules: true,
    },
  });

  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow="Admin review" title="Trainers" description="Verify trainer identity, Facebook Page, public information, schedule, rate, and payment readiness before approval." />
      <div className="space-y-4">
        {profiles.map((profile) => {
          const name = profile.user.playerName ?? profile.user.name ?? profile.user.email;
          const paymentReady = profile.paymentMode === "AUTOMATIC"
            ? Boolean(profile.user.trainerGateway && !profile.user.trainerGateway.disconnectedAt)
            : profile.user.trainerManualMethods.length > 0;
          return (
            <article key={profile.id} className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-black text-navy">{name}</h2><p className="mt-1 text-sm text-slate-500">@{profile.user.username ?? "no-username"} · {profile.user.email} · {profile.user.phone ?? "No phone"}</p></div>
                <Badge tone={profile.status === "ACTIVE" ? "success" : profile.status === "PENDING" ? "warn" : profile.status === "DEACTIVATED" ? "danger" : "neutral"}>{profile.status}</Badge>
              </div>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <ReviewFact label="Rate" value={profile.hourlyRate ? `₱${Number(profile.hourlyRate).toFixed(2)}/hour` : "Missing"} />
                <ReviewFact label="Sports" value={profile.sports.join(", ") || "Missing"} />
                <ReviewFact label="Schedule" value={`${profile.weeklyRules.length} weekly ${profile.weeklyRules.length === 1 ? "window" : "windows"}`} />
                <ReviewFact label="Payment" value={paymentReady ? `${profile.paymentMode} ready` : "Not ready"} bad={!paymentReady} />
              </div>
              <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="font-bold text-navy">General area</dt><dd className="mt-1 text-slate-600">{profile.area ?? "Missing"} · In person</dd></div>
                <div><dt className="font-bold text-navy">Specialties</dt><dd className="mt-1 text-slate-600">{profile.specialties.join(", ") || "Missing"}</dd></div>
                <div className="sm:col-span-2"><dt className="font-bold text-navy">Private fulfillment instructions</dt><dd className="mt-1 whitespace-pre-line text-slate-600">{profile.locationDetails ?? "Missing"}</dd></div>
                <div className="sm:col-span-2"><dt className="font-bold text-navy">Bio</dt><dd className="mt-1 whitespace-pre-line text-slate-600">{profile.bio ?? "Missing"}</dd></div>
                <div className="sm:col-span-2"><dt className="font-bold text-navy">Experience</dt><dd className="mt-1 whitespace-pre-line text-slate-600">{profile.experience ?? "Missing"}</dd></div>
                {profile.certifications && <div className="sm:col-span-2"><dt className="font-bold text-navy">Certifications</dt><dd className="mt-1 whitespace-pre-line text-slate-600">{profile.certifications}</dd></div>}
              </dl>
              {profile.facebookPage ? <a href={profile.facebookPage} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-[#1877F2]/10 px-3 py-2 text-xs font-bold text-[#1877F2]">Inspect required Facebook Page ↗</a> : <p className="mt-3 text-sm font-bold text-red-600">Facebook Page missing</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <form action={decideTrainerApplicationAction}><input type="hidden" name="trainerProfileId" value={profile.id} /><input type="hidden" name="action" value="APPROVE" /><button disabled={profile.status !== "PENDING" || !paymentReady} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Approve trainer</button></form>
                <form action={decideTrainerApplicationAction} className="flex gap-2"><input type="hidden" name="trainerProfileId" value={profile.id} /><input type="hidden" name="action" value="DEACTIVATE" /><input name="reason" required minLength={3} placeholder="Required reason" className="min-w-0 flex-1 rounded-xl border border-red-200 px-3 text-sm" /><button className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">Deactivate</button></form>
              </div>
            </article>
          );
        })}
        {profiles.length === 0 && <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">No trainer profiles yet.</p>}
      </div>
    </div>
  );
}

function ReviewFact({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return <div><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className={`mt-1 font-semibold ${bad ? "text-red-600" : "text-navy"}`}>{value}</p></div>;
}
