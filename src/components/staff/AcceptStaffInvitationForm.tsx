"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import {
  acceptStaffInvitationAction,
  type StaffingFormState,
} from "@/lib/staffing-actions";

const initialState: StaffingFormState = {};

export function AcceptStaffInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptStaffInvitationAction,
    initialState
  );
  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token" value={token} />
      {state.message && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining team…" : "Accept and join team"}
      </Button>
    </form>
  );
}
