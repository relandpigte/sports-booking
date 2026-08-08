"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { CoverPhotosUpload } from "@/components/dashboard/hubs/CoverPhotosUpload";
import { GamesSelect } from "@/components/dashboard/hubs/GamesSelect";
import { CourtsEditor } from "@/components/dashboard/hubs/CourtsEditor";
import { LocationPicker } from "@/components/dashboard/hubs/LocationPicker";
import { OperatingHoursEditor } from "@/components/dashboard/hubs/OperatingHoursEditor";
import { HubIdentityFields } from "@/components/hubs/HubIdentityFields";
import {
  HUB_BOOKING_STATUS_OPTIONS,
  type HubBookingStatusValue,
} from "@/lib/constants";
import {
  createHubAction,
  updateHubAction,
  type HubFormState,
} from "@/lib/hub-actions";
import type { Hub } from "@/lib/hubs";

const initialState: HubFormState = {};

export function HubForm({ hub }: { hub?: Hub }) {
  const isEdit = Boolean(hub);
  const action = isEdit ? updateHubAction : createHubAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  // The dialog is dismissible, so its visibility can't be derived from state
  // alone — it's keyed to the message so a NEW failure re-opens it.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<HubBookingStatusValue>(
    hub?.bookingStatus ?? "OPEN"
  );
  const showDialog = Boolean(state.message) && dismissed !== state.message;

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6 flex flex-col gap-6 rounded-2xl border border-gray-200 p-5 sm:p-6"
    >
      {isEdit && <input type="hidden" name="id" value={hub!.id} />}

      {/* Kept alongside the dialog: once the partner dismisses the popup they
          still need to see why the save didn't go through. */}
      {state.message && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <Modal
        open={showDialog}
        onClose={() => setDismissed(state.message ?? null)}
        title="Couldn't save"
        tone="warn"
      >
        <p>{state.message}</p>
      </Modal>

      <CoverPhotosUpload
        defaultValue={hub?.coverPhotos ?? []}
        error={state.errors?.coverPhotos}
      />

      <div className="flex flex-col items-start gap-6 sm:flex-row">
        <AvatarUpload
          name="logo"
          label="Logo"
          defaultValue={hub?.logo ?? undefined}
          error={state.errors?.logo}
        />
        <div className="flex w-full flex-1 flex-col gap-4">
          <HubIdentityFields
            defaultName={state.values?.name ?? hub?.name ?? ""}
            defaultSlug={state.values?.slug ?? hub?.slug ?? ""}
            nameError={state.errors?.name}
            slugError={state.errors?.slug}
          />
          <Textarea
            label="About"
            name="about"
            rows={4}
            placeholder="Tell players about your hub — facilities, vibe, what makes it great."
            defaultValue={state.values?.about ?? hub?.about ?? ""}
            error={state.errors?.about}
          />
        </div>
      </div>

      <LocationPicker
        defaultAddress={hub?.address ?? ""}
        defaultLat={hub?.latitude ?? null}
        defaultLng={hub?.longitude ?? null}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Phone Number"
          name="phone"
          type="tel"
          placeholder="Contact phone"
          defaultValue={state.values?.phone ?? hub?.phone ?? ""}
          error={state.errors?.phone}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="Contact email"
          defaultValue={state.values?.email ?? hub?.email ?? ""}
          error={state.errors?.email}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
              Online booking status
            </p>
            <h2 className="mt-1 text-lg font-black text-navy">
              Control when players can book
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Coming Soon and Under Maintenance display a public banner and
              block all new court bookings and event registrations. Existing
              bookings remain unchanged.
            </p>
          </div>

          <label className="block w-full lg:max-w-xs">
            <span className="text-xs font-bold text-slate-600">Status</span>
            <select
              name="bookingStatus"
              value={bookingStatus}
              onChange={(event) =>
                setBookingStatus(event.target.value as HubBookingStatusValue)
              }
              className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            >
              {HUB_BOOKING_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              {
                HUB_BOOKING_STATUS_OPTIONS.find(
                  (option) => option.value === bookingStatus
                )?.description
              }
            </span>
          </label>
        </div>

        {bookingStatus !== "OPEN" && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <Textarea
              label="Public banner message (optional)"
              name="bookingStatusMessage"
              rows={3}
              maxLength={240}
              placeholder={
                bookingStatus === "COMING_SOON"
                  ? "We’re preparing the courts and will open bookings soon."
                  : "Court bookings are temporarily paused while we complete maintenance."
              }
              defaultValue={
                state.values?.bookingStatusMessage ??
                hub?.bookingStatusMessage ??
                ""
              }
              error={state.errors?.bookingStatusMessage}
            />
          </div>
        )}
      </section>

      <GamesSelect defaultValue={hub?.games ?? ["pickleball"]} />

      <OperatingHoursEditor defaultValue={hub?.operatingHours ?? null} />

      <CourtsEditor defaultValue={hub?.courts ?? []} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : isEdit ? "Save Hub" : "Create Hub"}
        </Button>
        <Link
          href="/dashboard/hubs"
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
