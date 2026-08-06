"use client";

import { useActionState } from "react";

import { CoverPhotosUpload } from "@/components/dashboard/hubs/CoverPhotosUpload";
import { GamesSelect } from "@/components/dashboard/hubs/GamesSelect";
import { LocationPicker } from "@/components/dashboard/hubs/LocationPicker";
import { HubIdentityFields } from "@/components/hubs/HubIdentityFields";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  submitPartnerApplicationAction,
  type PartnerApplicationFormState,
} from "@/lib/partner-onboarding-actions";

const initialState: PartnerApplicationFormState = {};

export function PartnerApplicationForm({
  user,
}: {
  user: {
    playerName: string | null;
    phone: string | null;
    facebookPage: string | null;
    email: string;
  };
}) {
  const [state, action, pending] = useActionState(
    submitPartnerApplicationAction,
    initialState
  );

  return (
    <form action={action} noValidate className="mt-6 space-y-6">
      {state.message && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
        <h2 className="font-bold text-navy">Owner details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Used by the Bunal.club team while reviewing your venue.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input
            label="Full Name"
            name="fullName"
            autoComplete="name"
            defaultValue={state.values?.fullName ?? user.playerName ?? ""}
            error={state.errors?.fullName}
          />
          <Input
            label="Contact Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={state.values?.phone ?? user.phone ?? ""}
            error={state.errors?.phone}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
        <h2 className="font-bold text-navy">First hub</h2>
        <p className="mt-1 text-sm text-slate-500">
          This venue stays private until an admin approves the application.
        </p>

        <div className="mt-6 space-y-6">
          <div className="grid gap-6 border-b border-[#dfe7e2] pb-6 sm:grid-cols-[140px_1fr]">
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
            label="Hub Description (Optional)"
            name="hubAbout"
            rows={4}
            defaultValue={state.values?.hubAbout ?? ""}
            error={state.errors?.hubAbout}
          />
          <GamesSelect defaultValue={["pickleball"]} error={state.errors?.games} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Hub Email (Optional)"
              name="hubEmail"
              type="email"
              defaultValue={state.values?.hubEmail ?? user.email}
              error={state.errors?.hubEmail}
            />
            <Input
              label="Hub Phone (Optional)"
              name="hubPhone"
              type="tel"
              defaultValue={state.values?.hubPhone ?? ""}
              error={state.errors?.hubPhone}
            />
            <div className="sm:col-span-2">
              <Input
                label="Facebook Page (Optional)"
                name="facebookPage"
                defaultValue={
                  state.values?.facebookPage ?? user.facebookPage ?? ""
                }
                error={state.errors?.facebookPage}
              />
            </div>
          </div>

          <div>
            <LocationPicker defaultAddress={state.values?.address ?? ""} />
            {state.errors?.address && (
              <p className="mt-1 text-xs text-red-500">
                {state.errors.address}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-bold text-amber-900">Ready for review?</p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          Submitting locks this initial application while the team reviews it.
          Venue management unlocks after approval.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="sm:w-auto sm:px-8">
        {pending ? "Submitting…" : "Submit for Review"}
      </Button>
    </form>
  );
}
