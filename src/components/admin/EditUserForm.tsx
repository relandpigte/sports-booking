"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { ROLE_OPTIONS, SKILL_LEVELS } from "@/lib/constants";
import { updateUserAction, type AdminFormState } from "@/lib/admin-actions";
import type { AdminUser } from "@/lib/admin";

const initialState: AdminFormState = {};

export function EditUserForm({
  user,
  isSelf,
}: {
  user: AdminUser;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateUserAction,
    initialState
  );
  const [privateProfile, setPrivateProfile] = useState(user.privateProfile);

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6 rounded-2xl border border-gray-200 p-5 sm:p-6"
    >
      <input type="hidden" name="id" value={user.id} />

      {state.message && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <div className="mb-6">
        <AvatarUpload defaultValue={user.image} error={state.errors?.image} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Full Name"
          name="name"
          defaultValue={state.values?.name ?? user.name ?? ""}
          error={state.errors?.name}
        />
        <div className="flex flex-col gap-1.5">
          <Input
            label="Email Address"
            name="emailDisplay"
            defaultValue={user.email}
            disabled
          />
        </div>
        <Select
          label="Role"
          name="role"
          defaultValue={state.values?.role ?? user.role}
          options={ROLE_OPTIONS}
          disabled={isSelf}
        />
        {isSelf && (
          <input type="hidden" name="role" value={user.role} />
        )}
        <Input
          label="Player Name"
          name="playerName"
          defaultValue={state.values?.playerName ?? user.playerName ?? ""}
          error={state.errors?.playerName}
        />
        <Input
          label="Telephone"
          name="phone"
          type="tel"
          defaultValue={state.values?.phone ?? user.phone ?? ""}
          error={state.errors?.phone}
        />
        <Select
          label="Skill Level"
          name="skillLevel"
          defaultValue={state.values?.skillLevel ?? user.skillLevel}
          options={[...SKILL_LEVELS]}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Private profile</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Hide name and email from other players in sessions.
          </p>
        </div>
        <Toggle
          checked={privateProfile}
          onChange={setPrivateProfile}
          label="Private profile"
        />
      </div>
      <input
        type="hidden"
        name="privateProfile"
        value={privateProfile ? "on" : "off"}
      />
      {state.errors?.role && (
        <p className="mt-2 text-xs text-red-500">{state.errors.role}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Link
          href="/users"
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
