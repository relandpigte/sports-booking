"use client";

import { useActionState, useState } from "react";
import type { StaffAccessLevel } from "@prisma/client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StaffPermissionFields } from "@/components/staff/StaffPermissionFields";
import {
  cancelStaffInvitationAction,
  inviteStaffAction,
  removeStaffAction,
  resendStaffInvitationAction,
  updateStaffPermissionsAction,
  type StaffingFormState,
} from "@/lib/staffing-actions";
import {
  STAFF_MODULES,
  type StaffModule,
  type StaffPermissions,
} from "@/lib/staffing-shared";

const initialState: StaffingFormState = {};

type Member = {
  id: string;
  acceptedAt: Date;
  hubs: StaffAccessLevel;
  bookings: StaffAccessLevel;
  events: StaffAccessLevel;
  reports: StaffAccessLevel;
  messages: StaffAccessLevel;
  payments: StaffAccessLevel;
  user: {
    id: string;
    name: string | null;
    playerName: string | null;
    email: string;
    image: string | null;
  };
};

type Invitation = {
  id: string;
  email: string;
  expiresAt: Date;
  hubs: StaffAccessLevel;
  bookings: StaffAccessLevel;
  events: StaffAccessLevel;
  reports: StaffAccessLevel;
  messages: StaffAccessLevel;
  payments: StaffAccessLevel;
};

type Activity = {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: Date;
  actor: {
    name: string | null;
    playerName: string | null;
    email: string;
  } | null;
};

function permissionsOf(row: Record<StaffModule, StaffAccessLevel>) {
  return Object.fromEntries(
    STAFF_MODULES.map((module) => [module, row[module]])
  ) as StaffPermissions;
}

export function StaffTeamManager({
  members,
  invitations,
  activity,
}: {
  members: Member[];
  invitations: Invitation[];
  activity: Activity[];
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [state, action, pending] = useActionState(
    inviteStaffAction,
    initialState
  );

  return (
    <div className="mt-7 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black text-navy">Team access</h2>
            <p className="mt-1 text-sm text-slate-500">
              Invite player accounts and choose what each person can view or
              manage.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInvite((value) => !value)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
          >
            {showInvite ? "Close invitation" : "+ Invite staff"}
          </button>
        </div>

        {showInvite && (
          <form action={action} className="mt-6 space-y-5 border-t border-slate-100 pt-6">
            {state.message && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {state.message}
              </p>
            )}
            {state.success && (
              <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {state.success}
              </p>
            )}
            <Input
              label="Staff email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="staff@example.com"
              defaultValue={state.values?.email}
              error={state.errors?.email}
            />
            <StaffPermissionFields errors={state.errors} />
            <Button type="submit" disabled={pending} className="sm:w-auto sm:px-7">
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-black text-navy">Recent team activity</h2>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No staff activity yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {activity.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">
                    {activityLabel(entry.action)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {entry.actor?.playerName ?? entry.actor?.name ?? entry.actor?.email ?? "Removed account"}
                    {entry.targetType ? ` · ${entry.targetType}` : ""}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-slate-400">
                  {formatDate(entry.createdAt)}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>

      {invitations.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-black text-navy">Pending invitations</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy">{invitation.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Expires {formatDate(invitation.expiresAt)} · {permissionLabel(permissionsOf(invitation))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={resendStaffInvitationAction}>
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <button className="rounded-lg px-3 py-2 text-xs font-bold text-primary hover:bg-primary-soft">Resend</button>
                  </form>
                  <form action={cancelStaffInvitationAction}>
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <button className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Cancel</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-black text-navy">Staff members</h2>
        {members.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            No staff have accepted an invitation yet.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {members.map((member) => (
              <StaffMemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StaffMemberCard({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    updateStaffPermissionsAction,
    initialState
  );
  const name = member.user.playerName ?? member.user.name ?? member.user.email;
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Avatar src={member.user.image} name={name} size={42} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-navy">{name}</p>
          <p className="truncate text-xs text-slate-500">{member.user.email}</p>
          <p className="mt-1 text-xs text-slate-400">
            {permissionLabel(permissionsOf(member))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="rounded-lg px-3 py-2 text-xs font-bold text-primary hover:bg-primary-soft"
        >
          {editing ? "Close" : "Edit access"}
        </button>
      </div>
      {editing && (
        <form action={action} className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <input type="hidden" name="membershipId" value={member.id} />
          {state.message && <p className="text-sm text-red-600">{state.message}</p>}
          {state.success && <p className="text-sm text-green-700">{state.success}</p>}
          <StaffPermissionFields defaults={permissionsOf(member)} errors={state.errors} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" disabled={pending} className="sm:w-auto sm:px-6">
              {pending ? "Saving…" : "Save access"}
            </Button>
            <button
              formAction={removeStaffAction}
              className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              Remove staff
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function permissionLabel(permissions: StaffPermissions) {
  const enabled = STAFF_MODULES.filter((module) => permissions[module] !== "NONE");
  return enabled.length === 0
    ? "No access"
    : enabled.map((module) => `${module}: ${permissions[module].toLowerCase()}`).join(" · ");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

function activityLabel(action: string) {
  return action
    .toLocaleLowerCase("en-PH")
    .split("_")
    .map((part) => part[0]?.toLocaleUpperCase("en-PH") + part.slice(1))
    .join(" ");
}
