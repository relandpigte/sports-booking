"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { CoverPhotosUpload } from "@/components/dashboard/hubs/CoverPhotosUpload";
import { GamesSelect } from "@/components/dashboard/hubs/GamesSelect";
import { LocationPicker } from "@/components/dashboard/hubs/LocationPicker";
import { HubIdentityFields } from "@/components/hubs/HubIdentityFields";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { registerPartnerAction, type AuthFormState } from "@/lib/actions";
import { SERVICE_FEE_PERCENT } from "@/lib/constants";

const initialState: AuthFormState = {};

function SectionHeading({
  type,
  title,
  description,
}: {
  type: "owner" | "hub";
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          type === "owner"
            ? "bg-primary-soft text-primary"
            : "bg-ocean-soft text-ocean"
        }`}
      >
        {type === "owner" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 21h18M5 21V5l7-3 7 3v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6" />
          </svg>
        )}
      </span>
      <div>
        <h3 className="text-lg font-bold text-navy">{title}</h3>
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function PartnerRegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerPartnerAction,
    initialState
  );
  const [agreed, setAgreed] = useState(false);

  return (
    <form action={formAction} noValidate className="space-y-7">
      {state.message && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <section className="rounded-3xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-8">
        <SectionHeading
          type="owner"
          title="Owner details"
          description="Your login and primary contact information."
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Full Name"
              name="fullName"
              autoComplete="name"
              placeholder="Juan Dela Cruz"
              defaultValue={state.values?.fullName ?? ""}
              error={state.errors?.fullName}
            />
          </div>
          <Input
            label="Email Address"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="juan@example.com"
            defaultValue={state.values?.email ?? ""}
            error={state.errors?.email}
          />
          <Input
            label="Contact Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            defaultValue={state.values?.phone ?? ""}
            error={state.errors?.phone}
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={state.errors?.password}
          />
          <Input
            label="Confirm Password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={state.errors?.confirmPassword}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-8">
        <SectionHeading
          type="hub"
          title="Hub details"
          description="Build the public profile players will discover and book."
        />

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 border-b border-[#dfe7e2] pb-6 sm:grid-cols-[140px_1fr]">
            <AvatarUpload
              name="hubLogo"
              label="Hub logo"
              error={state.errors?.hubLogo}
            />
            <CoverPhotosUpload error={state.errors?.coverPhotos} />
          </div>

          <HubIdentityFields
            nameField="hubName"
            defaultName={state.values?.hubName ?? ""}
            defaultSlug={state.values?.slug ?? ""}
            nameError={state.errors?.hubName}
            slugError={state.errors?.slug}
          />

          <Textarea
            label="Hub Description"
            name="hubAbout"
            rows={4}
            placeholder="Tell players about your courts, facilities, amenities, and atmosphere."
            defaultValue={state.values?.hubAbout ?? ""}
            error={state.errors?.hubAbout}
          />

          <GamesSelect
            defaultValue={["pickleball"]}
            error={state.errors?.games}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Hub Email (Optional)"
              name="hubEmail"
              type="email"
              autoComplete="email"
              placeholder="hello@yourhub.com"
              defaultValue={state.values?.hubEmail ?? ""}
              error={state.errors?.hubEmail}
            />
            <Input
              label="Hub Phone (Optional)"
              name="hubPhone"
              type="tel"
              autoComplete="tel"
              placeholder="038 123 4567"
              defaultValue={state.values?.hubPhone ?? ""}
              error={state.errors?.hubPhone}
            />
            <div className="sm:col-span-2">
              <Input
                label="Facebook Page (Optional)"
                name="facebookPage"
                placeholder="facebook.com/yourvenue"
                autoComplete="off"
                defaultValue={state.values?.facebookPage ?? ""}
                error={state.errors?.facebookPage}
              />
              <p className="mt-1 text-xs leading-5 text-gray-400">
                A link or page name both work. This helps the owner verify your
                venue and gives players another contact channel.
              </p>
            </div>
          </div>

          <div>
            <LocationPicker defaultAddress={state.values?.address ?? ""} />
            {state.errors?.address && (
              <p className="mt-1 text-xs text-red-500">{state.errors.address}</p>
            )}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5">
          <div className="flex gap-3">
            <span className="mt-0.5 text-ocean" aria-hidden="true">
              ⓘ
            </span>
            <div>
              <p className="text-sm font-bold text-navy">
                Free to join with transparent pricing
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                There are no plans, subscriptions, or monthly charges. Players
                pay a {SERVICE_FEE_PERCENT}% Bunal.club service fee on top of
                the court total, and your venue keeps its advertised court
                rate.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <span className="mt-0.5 text-amber-700" aria-hidden="true">
              ◈
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Next: approval, PayMongo, and court setup
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Your hub is saved as an unpublished draft. After the owner
                approves your account, connect your own PayMongo account and
                add courts, rates, and operating hours before going live.
              </p>
            </div>
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-600">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-semibold text-primary hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.errors?.agreed && (
        <p className="-mt-5 text-xs text-red-500">{state.errors.agreed}</p>
      )}

      <Button type="submit" disabled={pending} className="rounded-xl py-4 text-base">
        {pending ? "Creating your partner profile…" : "Create account and hub draft"}
      </Button>
    </form>
  );
}
