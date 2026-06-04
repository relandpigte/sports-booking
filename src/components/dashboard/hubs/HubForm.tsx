"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { CoverPhotosUpload } from "@/components/dashboard/hubs/CoverPhotosUpload";
import { GamesSelect } from "@/components/dashboard/hubs/GamesSelect";
import { CourtsEditor } from "@/components/dashboard/hubs/CourtsEditor";
import { OperatingHoursEditor } from "@/components/dashboard/hubs/OperatingHoursEditor";
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

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6 flex flex-col gap-6 rounded-2xl border border-gray-200 p-5 sm:p-6"
    >
      {isEdit && <input type="hidden" name="id" value={hub!.id} />}

      {state.message && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

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
          <Input
            label="Hub Name"
            name="name"
            placeholder="e.g. Riverside Pickleball Club"
            defaultValue={state.values?.name ?? hub?.name ?? ""}
            error={state.errors?.name}
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

      <Input
        label="Location / Address"
        name="address"
        placeholder="e.g. 12 River St, Brisbane QLD 4000"
        defaultValue={state.values?.address ?? hub?.address ?? ""}
        error={state.errors?.address}
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

      <GamesSelect defaultValue={hub?.games ?? []} />

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
