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
