"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import {
  ROLE_OPTIONS,
  SKILL_LEVELS,
  DEFAULT_SKILL_LEVEL,
} from "@/lib/constants";
import { createUserAction, type AdminFormState } from "@/lib/admin-actions";

const initialState: AdminFormState = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(
    createUserAction,
    initialState
  );

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6 rounded-2xl border border-gray-200 p-5 sm:p-6"
    >
      {state.message && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}

      <div className="mb-6">
        <AvatarUpload error={state.errors?.image} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Full Name"
          name="name"
          placeholder="Full name or business name"
          defaultValue={state.values?.name}
          error={state.errors?.name}
        />
        <Input
          label="Email Address"
          name="email"
          type="email"
          placeholder="name@example.com"
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <Select
          label="Role"
          name="role"
          defaultValue={state.values?.role ?? "PLAYER"}
          options={ROLE_OPTIONS}
        />
        <Input
          label="Temporary Password"
          name="password"
          type="text"
          placeholder="Min 6 characters"
          autoComplete="off"
          error={state.errors?.password}
        />
        <Input
          label="Player Name (optional)"
          name="playerName"
          placeholder="Display name in games"
          defaultValue={state.values?.playerName}
          error={state.errors?.playerName}
        />
        <Input
          label="Telephone (optional)"
          name="phone"
          type="tel"
          placeholder="Phone number"
          defaultValue={state.values?.phone}
          error={state.errors?.phone}
        />
        <div className="sm:col-span-2">
          <Select
            label="Skill Level"
            name="skillLevel"
            defaultValue={state.values?.skillLevel ?? DEFAULT_SKILL_LEVEL}
            options={[...SKILL_LEVELS]}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Creating…" : "Create User"}
        </Button>
        <Link
          href="/admin"
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
