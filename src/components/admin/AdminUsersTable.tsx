"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { PartnerActivationButton } from "@/components/admin/PartnerActivationButton";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AdminUser } from "@/lib/admin";
import { SKILL_LEVELS } from "@/lib/constants";
import { startPartnerImpersonationAction } from "@/lib/impersonation-actions";
import { facebookPageLabel } from "@/lib/social";

type OptionalField =
  | "email"
  | "skill"
  | "partnerStatus"
  | "lastLogin"
  | "loginCount"
  | "joined";

const fieldOptions: { id: OptionalField; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "skill", label: "Skill" },
  { id: "partnerStatus", label: "Partner status" },
  { id: "lastLogin", label: "Last login" },
  { id: "loginCount", label: "Login count" },
  { id: "joined", label: "Joined" },
];
const defaultFields: OptionalField[] = fieldOptions.map(({ id }) => id);
const storageKey = "bunal-admin-user-columns";

function skillLabel(value: string) {
  return SKILL_LEVELS.find((skill) => skill.value === value)?.label ?? value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatLoginDate(date: Date | null) {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function trainerStatus(status: AdminUser["trainerStatus"]): {
  label: string;
  tone: BadgeTone;
} | null {
  if (!status) return null;
  if (status === "ACTIVE") return { label: "Active", tone: "success" };
  if (status === "PENDING") return { label: "Pending review", tone: "warn" };
  if (status === "DEACTIVATED") {
    return { label: "Deactivated", tone: "danger" };
  }
  return { label: "Draft", tone: "neutral" };
}

function partnerStatus(status: AdminUser["partnerStatus"]): {
  label: string;
  tone: BadgeTone;
} {
  if (status === "ACTIVE") return { label: "Verified", tone: "success" };
  if (status === "PENDING") return { label: "Pending review", tone: "warn" };
  if (status === "DEACTIVATED") {
    return { label: "Deactivated", tone: "danger" };
  }
  return { label: "Draft", tone: "neutral" };
}

export function AdminUsersTable({
  users,
  adminId,
  toolbar,
}: {
  users: AdminUser[];
  adminId: string;
  toolbar: ReactNode;
}) {
  const [visibleFields, setVisibleFields] =
    useState<OptionalField[]>(defaultFields);
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let restoreTimer: number | undefined;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) {
        const valid = stored.filter((value): value is OptionalField =>
          fieldOptions.some((field) => field.id === value)
        );
        if (valid.length > 0) {
          restoreTimer = window.setTimeout(() => setVisibleFields(valid), 0);
        }
      }
    } catch {
      // A corrupt preference should never prevent user management.
    }
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    function closeChooser(event: MouseEvent) {
      if (!chooserRef.current?.contains(event.target as Node)) {
        setChooserOpen(false);
      }
    }
    document.addEventListener("mousedown", closeChooser);
    return () => document.removeEventListener("mousedown", closeChooser);
  }, []);

  function toggleField(field: OptionalField) {
    setVisibleFields((current) => {
      const next = current.includes(field)
        ? current.filter((value) => value !== field)
        : [...current, field];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function visible(field: OptionalField) {
    return visibleFields.includes(field);
  }

  return (
    <>
      <section
        className="mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5"
        aria-labelledby="find-users-heading"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="find-users-heading" className="text-base font-black text-navy">
                Find and filter accounts
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Search identity details, then narrow results by role or profile
                status.
              </p>
            </div>
            <div className="relative shrink-0" ref={chooserRef}>
              <button
                type="button"
                aria-expanded={chooserOpen}
                aria-haspopup="menu"
                onClick={() => setChooserOpen((open) => !open)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                <ColumnsIcon />
                Display
              </button>
              {chooserOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl shadow-navy/10"
                >
                  <p className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                    Visible details
                  </p>
                  <div className="mt-2 space-y-1">
                    {fieldOptions.map((field) => (
                      <label
                        key={field.id}
                        className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={visible(field.id)}
                          onChange={() => toggleField(field.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        {field.label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 border-t border-gray-100 px-1 pt-2 text-[10px] leading-4 text-gray-400">
                    Identity, role, trainer capability, profile status, and
                    actions always remain visible.
                  </p>
                </div>
              )}
            </div>
          </div>
          {toolbar}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="font-semibold text-navy">Always visible:</span>
            {[
              "Identity",
              "Account role",
              "Trainer capability",
              "Profile status",
              "Actions",
            ].map((label) => (
              <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5" aria-labelledby="user-directory-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="user-directory-heading" className="text-sm font-black text-navy">
              User directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Trainer appears as an additional capability on player accounts.
            </p>
          </div>
          <p className="text-xs font-medium text-slate-400">
            {users.length} {users.length === 1 ? "account" : "accounts"} on this page
          </p>
        </div>

        {users.length > 0 ? (
          <div className="space-y-3">
            {users.map((user) => (
              <UserDirectoryRow
                key={user.id}
                user={user}
                isSelf={user.id === adminId}
                visible={visible}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-soft text-navy">
              <SearchEmptyIcon />
            </span>
            <h3 className="mt-4 font-black text-navy">No users found</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
              Try another name, email, role, or profile status.
            </p>
            <Link
              href="/users"
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#dfe7e2] px-4 text-sm font-bold text-navy hover:bg-slate-50"
            >
              Clear all filters
            </Link>
          </div>
        )}
      </section>
    </>
  );
}

function UserDirectoryRow({
  user,
  isSelf,
  visible,
}: {
  user: AdminUser;
  isSelf: boolean;
  visible: (field: OptionalField) => boolean;
}) {
  const trainer = trainerStatus(user.trainerStatus);
  const partner = partnerStatus(user.partnerStatus);

  return (
    <article className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/[0.03] transition-all hover:border-primary/25 hover:shadow-md hover:shadow-navy/5 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(240px,1.25fr)_minmax(210px,1fr)_minmax(170px,.8fr)_minmax(210px,auto)] lg:items-center">
        <section aria-label="Identity">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
            Account
          </p>
          <div className="flex items-start gap-3">
            <Avatar
              src={user.image}
              name={user.name ?? user.email}
              size={44}
              className="ring-4 ring-primary-soft"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-black text-navy">
                  {user.name ?? "Unnamed user"}
                </h3>
                {isSelf && (
                  <Badge tone="neutral" className="text-[10px]">
                    You
                  </Badge>
                )}
              </div>
              {visible("email") && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {user.email}
                </p>
              )}
              {user.playerName && (
                <p className="mt-1 truncate text-xs font-semibold text-primary">
                  {user.playerName}
                </p>
              )}
              {visible("skill") && user.role !== "PARTNER" && (
                <p className="mt-1 text-[11px] text-slate-400">
                  {skillLabel(user.skillLevel)} player
                </p>
              )}
              {visible("email") && user.facebookPage && (
                <a
                  href={user.facebookPage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block max-w-56 truncate text-[11px] text-ocean hover:underline"
                >
                  {facebookPageLabel(user.facebookPage)}
                </a>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Profile status">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Profile status
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <RoleSelect
              userId={user.id}
              role={user.role}
              disabled={isSelf}
            />
            {trainer && (
              <Badge tone="primary" className="gap-1 py-1 font-bold text-ocean bg-ocean-soft">
                <TrainerIcon />
                Trainer
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {trainer && (
              <Badge tone={trainer.tone} className="py-1 text-[11px] font-bold">
                {trainer.label}
              </Badge>
            )}
            {user.role === "PARTNER" && visible("partnerStatus") && (
              <Badge tone={partner.tone} className="py-1 text-[11px] font-bold">
                {partner.label} partner
              </Badge>
            )}
            {!trainer && user.role !== "PARTNER" && (
              <span className="text-xs text-slate-400">
                {user.role === "ADMIN" ? "Owner access" : "Standard player"}
              </span>
            )}
          </div>
        </section>

        <section aria-label="Activity">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Activity
          </p>
          {visible("lastLogin") && (
            <p className="text-xs font-semibold text-navy">
              {formatLoginDate(user.lastLoginAt)}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {visible("loginCount") && (
              <span>{user.loginCount.toLocaleString("en-PH")} logins</span>
            )}
            {visible("joined") && <span>Joined {formatDate(user.createdAt)}</span>}
          </div>
        </section>

        <section aria-label="Actions">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:text-right">
            Actions
          </p>
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {user.trainerStatus === "PENDING" && (
              <Link
                href="/dashboard/admin/trainers"
                className="inline-flex min-h-9 items-center rounded-lg bg-ocean-soft px-3 text-xs font-bold text-ocean hover:bg-ocean/15"
              >
                Review
              </Link>
            )}
            {user.role === "PARTNER" && (
              <>
                <form action={startPartnerImpersonationAction}>
                  <input type="hidden" name="partnerId" value={user.id} />
                  <button
                    type="submit"
                    title={`Assist ${user.name ?? user.email}`}
                    className="min-h-9 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
                  >
                    Assist
                  </button>
                </form>
                <PartnerActivationButton
                  userId={user.id}
                  status={user.partnerStatus}
                />
              </>
            )}
            <Link
              href={`/users/${user.id}/edit`}
              className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-primary hover:bg-primary-soft"
            >
              Edit
            </Link>
            {!isSelf && (
              <DeleteUserButton
                userId={user.id}
                name={user.name ?? user.email}
                blockedReason={user.deleteBlockedReason}
              />
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

function ColumnsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <rect
        x="2.75"
        y="3.25"
        width="14.5"
        height="13.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8 3.5v13M12 3.5v13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TrainerIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0M17 14l2 2 3-4" />
    </svg>
  );
}

function SearchEmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5M8.5 8.5l4 4m0-4-4 4" />
    </svg>
  );
}
