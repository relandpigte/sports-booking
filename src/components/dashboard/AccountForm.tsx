"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { SKILL_LEVELS, ROLE_LABELS } from "@/lib/constants";
import { updateProfileAction, type ProfileFormState } from "@/lib/actions";
import type { AdminUser } from "@/lib/admin";

const initialState: ProfileFormState = {};

// Reuses the shared user shape (id, name, playerName, email, phone, role, …).
type ProfileUser = Pick<
  AdminUser,
  | "name"
  | "playerName"
  | "email"
  | "phone"
  | "facebookPage"
  | "image"
  | "role"
  | "skillLevel"
  | "privateProfile"
>;

export function AccountForm({ user }: { user: ProfileUser }) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState
  );
  const [privateProfile, setPrivateProfile] = useState(user.privateProfile);

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6"
    >
      {state.ok && state.message && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
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
          defaultValue={user.name ?? ""}
          autoComplete="name"
          error={state.errors?.name}
        />
        <Input
          label="Player Name"
          name="playerName"
          defaultValue={user.playerName ?? ""}
          autoComplete="nickname"
          error={state.errors?.playerName}
        />
        <Input
          label="Email Address"
          name="emailDisplay"
          defaultValue={user.email}
          disabled
        />
        <Input
          label="Telephone"
          name="phone"
          type="tel"
          defaultValue={user.phone ?? ""}
          autoComplete="tel"
          error={state.errors?.phone}
        />
        <Select
          label="Skill Level"
          name="skillLevel"
          defaultValue={user.skillLevel}
          options={[...SKILL_LEVELS]}
        />
        {/* Only a venue has a page worth asking about. The action writes this
            column only when the field was actually submitted, so a player's
            form omitting it can never blank a stored value. */}
        {user.role === "PARTNER" && (
          <div className="sm:col-span-2">
            <Input
              label="Facebook page"
              name="facebookPage"
              placeholder="facebook.com/yourvenue"
              defaultValue={user.facebookPage ?? ""}
              autoComplete="off"
              error={state.errors?.facebookPage}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-800">Account type</span>
          <div className="flex h-[42px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
            {ROLE_LABELS[user.role]}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Private profile</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Hide your name and email from other players when you join sessions.
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

      <div className="mt-6">
        <Button type="submit" disabled={pending} className="sm:w-auto sm:px-8">
          {pending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
