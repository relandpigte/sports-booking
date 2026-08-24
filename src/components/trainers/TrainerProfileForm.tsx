"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

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
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        id="trainer-profile"
        action={formAction}
        className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm"
      >
        <div className="border-b border-[#e8efeb] px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Profile editor
          </p>
          <h2 className="mt-1 text-xl font-black text-navy">
            Build your public trainer profile
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Give players enough detail to understand your coaching style, price,
            and general location before they request a session.
          </p>
        </div>

        <div className="space-y-7 p-5 sm:p-6">
          {state.message && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {state.message}
            </p>
          )}
          {state.success && (
            <p
              role="status"
              className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            >
              {state.success}
            </p>
          )}

          <ProfileSection
            icon="identity"
            title="Public identity and pricing"
            description="These details help players recognize you and compare options."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Public username"
                name="username"
                required
                defaultValue={profile?.user.username ?? ""}
                error={state.errors?.username}
                placeholder="mika-cruz"
              />
              <Input
                label="Hourly rate (PHP)"
                name="hourlyRate"
                type="number"
                min="1"
                step="0.01"
                required
                defaultValue={profile?.hourlyRate?.toString() ?? ""}
                error={state.errors?.hourlyRate}
              />
              <Input
                label="Public area"
                name="area"
                required
                defaultValue={profile?.area ?? ""}
                error={state.errors?.area}
                placeholder="Quezon City"
              />
              <Input
                label="Facebook Page"
                name="facebookPage"
                required
                defaultValue={profile?.facebookPage ?? ""}
                error={state.errors?.facebookPage}
                placeholder="facebook.com/yourpage"
              />
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-gray-800">
                Sports you coach
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {GAMES.map((game) => (
                  <label
                    key={game.value}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-dark"
                  >
                    <input
                      type="checkbox"
                      name="sports"
                      value={game.value}
                      defaultChecked={profile?.sports.includes(game.value)}
                      className="h-4 w-4 accent-primary"
                    />
                    {game.label}
                  </label>
                ))}
              </div>
              {state.errors?.sports && (
                <p className="mt-1 text-xs text-red-500">
                  {state.errors.sports}
                </p>
              )}
            </fieldset>
          </ProfileSection>

          <ProfileSection
            icon="coaching"
            title="Coaching profile"
            description="Explain what you teach and the experience behind your sessions."
          >
            <div className="grid gap-4">
              <Textarea
                label="Bio"
                name="bio"
                rows={4}
                required
                defaultValue={profile?.bio ?? ""}
                error={state.errors?.bio}
              />
              <Textarea
                label="Training experience"
                name="experience"
                rows={4}
                required
                defaultValue={profile?.experience ?? ""}
                error={state.errors?.experience}
              />
              <Input
                label="Specialties (comma separated)"
                name="specialties"
                required
                defaultValue={profile?.specialties.join(", ") ?? ""}
                error={state.errors?.specialties}
                placeholder="Beginner fundamentals, match strategy"
              />
              <Textarea
                label="Certifications (optional)"
                name="certifications"
                rows={3}
                defaultValue={profile?.certifications ?? ""}
                error={state.errors?.certifications}
              />
            </div>
          </ProfileSection>

          <ProfileSection
            icon="private"
            title="Private meeting details"
            description="Only confirmed players can see these instructions."
          >
            <div className="mb-4 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
              <ShieldIcon />
              <p>
                Your public area appears on your profile. Exact court, landmark,
                and arrival instructions unlock only after payment.
              </p>
            </div>
            <Textarea
              label="Meeting instructions"
              name="locationDetails"
              rows={4}
              required
              defaultValue={profile?.locationDetails ?? ""}
              error={state.errors?.locationDetails}
              placeholder="Court name, gate, landmark, and arrival notes"
            />
          </ProfileSection>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#e8efeb] bg-[#fbfdfc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-slate-500">
            Save changes before submitting your profile for review.
          </p>
          <Button
            type="submit"
            disabled={pending}
            className="sm:w-auto sm:px-8"
          >
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>

      <aside className="space-y-5 lg:sticky lg:top-24">
        <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Trainer readiness
          </p>
          <h2 className="mt-1 text-lg font-black text-navy">
            Complete your setup
          </h2>
          <div className="mt-5 space-y-1">
            <SetupStep
              number="1"
              title="Profile details"
              detail="Identity, coaching, and location"
              href="#trainer-profile"
              active
            />
            <SetupStep
              number="2"
              title="Availability"
              detail="Weekly schedule and exceptions"
              href="/dashboard/trainer/schedule"
            />
            <SetupStep
              number="3"
              title="Payments"
              detail="Checkout and settlement setup"
              href="/dashboard/trainer/payments"
            />
            <SetupStep
              number="4"
              title="Admin review"
              detail="Submit when every step is ready"
            />
          </div>
        </section>

        <form
          action={submitAction}
          className="rounded-2xl border border-primary/20 bg-primary-soft p-5"
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Final step
          </p>
          <h2 className="mt-1 font-black text-navy">Admin review</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Submit once your profile, account details, availability, and payment
            setup are ready.
          </p>
          {submitState.missingRequirements?.length ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <p className="text-sm font-bold text-amber-900">
                {submitState.message}
              </p>
              <ul className="mt-3 space-y-3">
                {submitState.missingRequirements.map((requirement) => (
                  <li
                    key={`${requirement.href}-${requirement.label}`}
                    className="text-sm"
                  >
                    <span className="block leading-5 text-amber-900">
                      {requirement.label}
                    </span>
                    <Link
                      href={requirement.href}
                      className="mt-1 inline-flex font-bold text-primary hover:underline"
                    >
                      {requirement.actionLabel} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : submitState.message || submitState.success ? (
            <p
              role={submitState.success ? "status" : "alert"}
              className={`mt-3 text-sm ${
                submitState.success ? "text-green-700" : "text-red-700"
              }`}
            >
              {submitState.success ?? submitState.message}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              submitting ||
              profile?.status === "ACTIVE" ||
              profile?.status === "PENDING"
            }
            className="mt-4"
          >
            {profile?.status === "ACTIVE"
              ? "Trainer profile active"
              : profile?.status === "PENDING"
                ? "Pending admin review"
                : submitting
                  ? "Submitting…"
                  : "Submit for review"}
          </Button>
        </form>
      </aside>
    </div>
  );
}

function ProfileSection({
  icon,
  title,
  description,
  children,
}: {
  icon: "identity" | "coaching" | "private";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <SectionIcon type={icon} />
        </span>
        <div>
          <h3 className="font-black text-navy">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="border-b border-[#edf2ef] pb-7 last:border-b-0 last:pb-0">
        {children}
      </div>
    </section>
  );
}

function SetupStep({
  number,
  title,
  detail,
  href,
  active = false,
}: {
  number: string;
  title: string;
  detail: string;
  href?: string;
  active?: boolean;
}) {
  const content = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          active ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-navy">{title}</span>
        <span className="block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
      {href && <ChevronIcon />}
    </>
  );

  return href ? (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50 ${
        active ? "bg-primary-soft" : ""
      }`}
    >
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-xl p-3">{content}</div>
  );
}

function SectionIcon({ type }: { type: "identity" | "coaching" | "private" }) {
  if (type === "identity") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" />
      </svg>
    );
  }

  if (type === "coaching") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 4h14v13H5z" />
        <path d="M8 20h8M12 17v3M8 8h8M8 12h5" />
      </svg>
    );
  }

  return <ShieldIcon />;
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3 5 6v5c0 4.4 2.7 8.1 7 10 4.3-1.9 7-5.6 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}
