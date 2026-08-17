"use client";

import { useActionState, useState } from "react";
import type { StaffAccessLevel } from "@prisma/client";

import { StaffPermissionFields } from "@/components/staff/StaffPermissionFields";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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

const moduleLabels: Record<StaffModule, string> = {
  hubs: "Hubs",
  bookings: "Bookings",
  events: "Events",
  reports: "Reports",
  messages: "Messages",
  payments: "Payments",
  openPlay: "Open Play",
};

type Member = {
  id: string;
  acceptedAt: Date;
  hubs: StaffAccessLevel;
  bookings: StaffAccessLevel;
  events: StaffAccessLevel;
  reports: StaffAccessLevel;
  messages: StaffAccessLevel;
  payments: StaffAccessLevel;
  openPlay: StaffAccessLevel;
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
  openPlay: StaffAccessLevel;
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
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteStaffAction,
    initialState
  );
  const editingMember =
    members.find((member) => member.id === editingMemberId) ?? null;

  const openInvitation = () => {
    setEditingMemberId(null);
    setShowInvite(true);
  };

  const openEditor = (memberId: string) => {
    setShowInvite(false);
    setEditingMemberId(memberId);
  };

  return (
    <div className="mt-7 space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <TeamIcon />
            </div>
            <div>
              <h2 className="font-black text-navy">Team access</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Invite player accounts and give each person only the access they
                need. Staff keep their personal player workspace.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={showInvite ? () => setShowInvite(false) : openInvitation}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
          >
            {showInvite ? <CloseIcon /> : <PlusIcon />}
            {showInvite ? "Close invitation" : "Invite staff"}
          </button>
        </div>

        <div className="grid border-t border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
          <SummaryStat
            icon={<TeamIcon />}
            label="Active staff"
            value={members.length}
            hint={members.length === 1 ? "Team member" : "Team members"}
          />
          <SummaryStat
            icon={<MailIcon />}
            label="Pending invites"
            value={invitations.length}
            hint="Awaiting acceptance"
          />
          <SummaryStat
            icon={<ActivityIcon />}
            label="Recent activity"
            value={activity.length}
            hint="Latest audit entries"
          />
        </div>
      </section>

      {showInvite && (
        <InviteStaffPanel
          state={inviteState}
          action={inviteAction}
          pending={invitePending}
          onClose={() => setShowInvite(false)}
        />
      )}

      {editingMember && (
        <StaffAccessEditor
          key={editingMember.id}
          member={editingMember}
          onClose={() => setEditingMemberId(null)}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-navy">Staff members</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review access or open the focused permission editor.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                {members.length} active
              </span>
            </div>

            {members.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-primary/25 bg-primary-soft/30 p-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                  <TeamIcon />
                </div>
                <p className="mt-3 text-sm font-bold text-navy">
                  No staff members yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Invite a player account to help with bookings, events, hubs,
                  reports, messages, or payments.
                </p>
                <button
                  type="button"
                  onClick={openInvitation}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white"
                >
                  Invite your first staff member
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {members.map((member) => (
                  <StaffMemberCard
                    key={member.id}
                    member={member}
                    editing={member.id === editingMemberId}
                    onEdit={() => openEditor(member.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {invitations.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-navy">Pending invitations</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Invitations expire seven days after they are sent.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                  {invitations.length} pending
                </span>
              </div>

              <div className="mt-5 divide-y divide-slate-100">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                          <MailIcon />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy">
                            {invitation.email}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Expires {formatDate(invitation.expiresAt)}
                          </p>
                        </div>
                      </div>
                      <PermissionBadges
                        permissions={permissionsOf(invitation)}
                        className="mt-3"
                      />
                    </div>
                    <div className="flex shrink-0 gap-2 sm:self-start">
                      <form action={resendStaffInvitationAction}>
                        <input
                          type="hidden"
                          name="invitationId"
                          value={invitation.id}
                        />
                        <button className="min-h-10 rounded-xl border border-primary/20 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary-soft">
                          Resend
                        </button>
                      </form>
                      <form action={cancelStaffInvitationAction}>
                        <input
                          type="hidden"
                          name="invitationId"
                          value={invitation.id}
                        />
                        <button className="min-h-10 rounded-xl px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-50">
                          Cancel
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-soft text-ocean">
                <ActivityIcon />
              </div>
              <div>
                <h2 className="font-black text-navy">Recent team activity</h2>
                <p className="text-xs text-slate-500">Latest owner and staff changes</p>
              </div>
            </div>

            {activity.length === 0 ? (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No staff activity yet.
              </p>
            ) : (
              <div className="mt-5 space-y-5">
                {activity.map((entry, index) => (
                  <div key={entry.id} className="relative flex items-start gap-3">
                    {index < activity.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[15px] top-8 h-[calc(100%+0.5rem)] w-px bg-slate-100"
                      />
                    )}
                    <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <ActivityIcon />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy">
                        {activityLabel(entry.action)}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        {entry.actor?.playerName ??
                          entry.actor?.name ??
                          entry.actor?.email ??
                          "Removed account"}
                        {entry.targetType ? ` · ${targetLabel(entry.targetType)}` : ""}
                      </p>
                      <time className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-primary/15 bg-primary-soft/45 p-5 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
              <ShieldIcon />
            </div>
            <h2 className="mt-4 font-black text-navy">Owner controls stay protected</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Staff cannot invite other staff, create or delete an entire hub,
              or control owner settlement payments. Access changes are logged.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:border-b-0 sm:px-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-2xl font-black text-navy">{value}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function InviteStaffPanel({
  state,
  action,
  pending,
  onClose,
}: {
  state: StaffingFormState;
  action: (payload: FormData) => void;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <section
      aria-labelledby="invite-staff-title"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-navy/5"
    >
      <div className="flex items-center justify-between gap-4 bg-navy px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent">
            <PlusIcon />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent">
              New team member
            </p>
            <h2 id="invite-staff-title" className="mt-1 text-lg font-black text-white">
              Invite staff and choose access
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close staff invitation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>

      <form action={action} className="space-y-5 p-5 sm:p-6">
        {state.message && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {state.message}
          </p>
        )}
        {state.success && (
          <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {state.success}
          </p>
        )}
        <div className="max-w-xl">
          <Input
            label="Staff email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="staff@example.com"
            defaultValue={state.values?.email}
            error={state.errors?.email}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Existing players keep their player account and can switch into your
            venue workspace after accepting.
          </p>
        </div>
        <StaffPermissionFields errors={state.errors} />
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-navy"
          >
            Cancel
          </button>
          <Button type="submit" disabled={pending} className="sm:w-auto sm:px-7">
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function StaffAccessEditor({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateStaffPermissionsAction,
    initialState
  );
  const name = member.user.playerName ?? member.user.name ?? member.user.email;

  return (
    <section
      aria-labelledby={`staff-editor-${member.id}`}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-navy/5"
    >
      <div className="flex items-center justify-between gap-4 bg-navy px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            src={member.user.image}
            name={name}
            size={44}
            className="ring-2 ring-white/15"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent">
              Edit staff access
            </p>
            <h2
              id={`staff-editor-${member.id}`}
              className="mt-1 truncate text-lg font-black text-white"
            >
              {name}
            </h2>
            <p className="truncate text-xs text-white/50">{member.user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close access editor for ${name}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>

      <form action={action} className="space-y-5 p-5 sm:p-6">
        <input type="hidden" name="membershipId" value={member.id} />
        {state.message && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {state.message}
          </p>
        )}
        {state.success && (
          <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {state.success}
          </p>
        )}
        <div>
          <h3 className="font-black text-navy">Permission matrix</h3>
          <p className="mt-1 text-sm text-slate-500">
            Choose one access level for every part of your venue workspace.
          </p>
        </div>
        <StaffPermissionFields
          key={permissionKey(permissionsOf(member))}
          defaults={permissionsOf(member)}
          errors={state.errors}
        />
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            formAction={removeStaffAction}
            className="min-h-11 rounded-xl px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            Remove staff
          </button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl px-5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-navy"
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending} className="sm:w-auto sm:px-7">
              {pending ? "Saving…" : "Save access"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function StaffMemberCard({
  member,
  editing,
  onEdit,
}: {
  member: Member;
  editing: boolean;
  onEdit: () => void;
}) {
  const name = member.user.playerName ?? member.user.name ?? member.user.email;

  return (
    <article
      className={`rounded-2xl border p-4 transition-colors sm:p-5 ${
        editing
          ? "border-primary bg-primary-soft/25"
          : "border-slate-200 hover:border-primary/40"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar src={member.user.image} name={name} size={46} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-navy">{name}</p>
            <p className="truncate text-xs text-slate-500">{member.user.email}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Joined {formatDate(member.acceptedAt)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={editing}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/15 bg-primary-soft px-3 text-xs font-bold text-primary transition-colors hover:border-primary/30 hover:bg-primary-soft/80"
        >
          <EditIcon />
          {editing ? "Editing access" : "Edit access"}
        </button>
      </div>
      <PermissionBadges permissions={permissionsOf(member)} className="mt-4" />
    </article>
  );
}

function PermissionBadges({
  permissions,
  className = "",
}: {
  permissions: StaffPermissions;
  className?: string;
}) {
  const enabled = STAFF_MODULES.filter(
    (module) => permissions[module] !== "NONE"
  );

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {enabled.length === 0 ? (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
          No access
        </span>
      ) : (
        enabled.map((module) => {
          const level = permissions[module];
          return (
            <span
              key={module}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                level === "MANAGE"
                  ? "border-primary/10 bg-primary-soft text-primary"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {moduleLabels[module]} · {level === "MANAGE" ? "Manage" : "View"}
            </span>
          );
        })
      )}
    </div>
  );
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

function targetLabel(targetType: string) {
  return targetType
    .replace(/^PartnerStaff/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("en-PH");
}

function permissionKey(permissions: StaffPermissions) {
  return STAFF_MODULES.map((module) => permissions[module]).join("-");
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function TeamIcon() {
  return (
    <svg {...iconProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg {...iconProps} width="15" height="15">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}
