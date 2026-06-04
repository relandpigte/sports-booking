"use client";

import { useRef } from "react";
import type { Role } from "@prisma/client";
import { setUserRoleAction } from "@/lib/admin-actions";
import { ROLE_OPTIONS } from "@/lib/constants";

// Inline role changer — submits the form as soon as the value changes.
export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setUserRoleAction}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={disabled}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Change role"
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
