"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { GAMES } from "@/lib/constants";
import {
  saveTrainerProfileAction,
  submitTrainerApplicationAction,
  type TrainerActionState,
} from "@/lib/trainer-actions";

const initialState: TrainerActionState = {};

type Profile = {
  status: "DRAFT" | "PENDING" | "ACTIVE" | "DEACTIVATED";
  bio: string | null;
  sports: string[];
  specialties: string[];
  experience: string | null;
  certifications: string | null;
  area: string | null;
  locationDetails: string | null;
  hourlyRate: { toString(): string } | null;
  facebookPage: string | null;
  user: { username: string | null; phone: string | null; image: string | null };
};

export function TrainerProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction, pending] = useActionState(
    saveTrainerProfileAction,
    initialState
  );
  const [submitState, submitAction, submitting] = useActionState(
    submitTrainerApplicationAction,
    initialState
  );
  return (
    <div className="space-y-5">
      <form id="trainer-profile" action={formAction} className="scroll-mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-black text-navy">Public trainer profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your general area and reviewed Facebook Page are public. Exact meeting instructions unlock only after payment.
          </p>
        </div>
        {state.message && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.message}</p>}
        {state.success && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{state.success}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Public username" name="username" required defaultValue={profile?.user.username ?? ""} error={state.errors?.username} placeholder="mika-cruz" />
          <Input label="Hourly rate (PHP)" name="hourlyRate" type="number" min="1" step="0.01" required defaultValue={profile?.hourlyRate?.toString() ?? ""} error={state.errors?.hourlyRate} />
          <Input label="Public area" name="area" required defaultValue={profile?.area ?? ""} error={state.errors?.area} placeholder="Quezon City" />
          <div className="sm:col-span-2"><Input label="Facebook Page" name="facebookPage" required defaultValue={profile?.facebookPage ?? ""} error={state.errors?.facebookPage} placeholder="facebook.com/yourpage" /></div>
          <div className="sm:col-span-2"><Textarea label="Bio" name="bio" rows={4} required defaultValue={profile?.bio ?? ""} error={state.errors?.bio} /></div>
          <div className="sm:col-span-2"><Textarea label="Training experience" name="experience" rows={4} required defaultValue={profile?.experience ?? ""} error={state.errors?.experience} /></div>
          <div className="sm:col-span-2"><Input label="Specialties (comma separated)" name="specialties" required defaultValue={profile?.specialties.join(", ") ?? ""} error={state.errors?.specialties} placeholder="Beginner fundamentals, match strategy" /></div>
          <div className="sm:col-span-2"><Textarea label="Certifications (optional)" name="certifications" rows={3} defaultValue={profile?.certifications ?? ""} error={state.errors?.certifications} /></div>
          <div className="sm:col-span-2"><Textarea label="Private meeting instructions" name="locationDetails" rows={3} required defaultValue={profile?.locationDetails ?? ""} error={state.errors?.locationDetails} /></div>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-gray-800">Sports</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {GAMES.map((game) => (
              <label key={game.value} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" name="sports" value={game.value} defaultChecked={profile?.sports.includes(game.value)} className="h-4 w-4 accent-primary" />
                {game.label}
              </label>
            ))}
          </div>
          {state.errors?.sports && <p className="mt-1 text-xs text-red-500">{state.errors.sports}</p>}
        </fieldset>
        <div className="mt-6"><Button type="submit" disabled={pending} className="sm:w-auto sm:px-8">{pending ? "Saving…" : "Save trainer profile"}</Button></div>
      </form>

      <form action={submitAction} className="rounded-2xl border border-primary/20 bg-primary-soft p-5">
        <h2 className="font-black text-navy">Admin review</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Submit your application when your profile, account details, availability, and payment setup are ready. If something is missing, we&apos;ll show you exactly what to fix.
        </p>
        {submitState.missingRequirements?.length ? (
          <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">
              {submitState.message}
            </p>
            <ul className="mt-3 space-y-3">
              {submitState.missingRequirements.map((requirement) => (
                <li key={`${requirement.href}-${requirement.label}`} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span className="leading-5 text-amber-900">{requirement.label}</span>
                  <Link href={requirement.href} className="shrink-0 font-bold text-primary hover:underline">
                    {requirement.actionLabel} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (submitState.message || submitState.success) ? (
          <p role={submitState.success ? "status" : "alert"} className={`mt-3 text-sm ${submitState.success ? "text-green-700" : "text-red-700"}`}>{submitState.success ?? submitState.message}</p>
        ) : null}
        <Button type="submit" disabled={submitting || profile?.status === "ACTIVE" || profile?.status === "PENDING"} className="mt-4 sm:w-auto sm:px-6">
          {profile?.status === "ACTIVE" ? "Trainer profile active" : profile?.status === "PENDING" ? "Pending admin review" : submitting ? "Submitting…" : "Submit for review"}
        </Button>
      </form>
    </div>
  );
}
