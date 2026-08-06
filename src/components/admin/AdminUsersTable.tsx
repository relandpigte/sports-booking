"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { PartnerActivationButton } from "@/components/admin/PartnerActivationButton";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { startPartnerImpersonationAction } from "@/lib/impersonation-actions";
import type { AdminUser } from "@/lib/admin";
import { facebookPageLabel } from "@/lib/social";
import { SKILL_LEVELS } from "@/lib/constants";

type OptionalColumn =
  | "email"
  | "skill"
  | "partnerStatus"
  | "lastLogin"
  | "loginCount"
  | "joined";

const columnOptions: { id: OptionalColumn; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "skill", label: "Skill" },
  { id: "partnerStatus", label: "Partner status" },
  { id: "lastLogin", label: "Last login" },
  { id: "loginCount", label: "Login count" },
  { id: "joined", label: "Joined" },
];
const defaultColumns: OptionalColumn[] = columnOptions.map(({ id }) => id);
const storageKey = "bunal-admin-user-columns";

function skillLabel(value: string) {
  return SKILL_LEVELS.find((skill) => skill.value === value)?.label ?? value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
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

export function AdminUsersTable({
  users,
  adminId,
  toolbar,
}: {
  users: AdminUser[];
  adminId: string;
  toolbar: ReactNode;
}) {
  const [visibleColumns, setVisibleColumns] =
    useState<OptionalColumn[]>(defaultColumns);
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let restoreTimer: number | undefined;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) {
        const valid = stored.filter((value): value is OptionalColumn =>
          columnOptions.some((column) => column.id === value)
        );
        if (valid.length > 0) {
          restoreTimer = window.setTimeout(() => setVisibleColumns(valid), 0);
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

  function toggleColumn(column: OptionalColumn) {
    setVisibleColumns((current) => {
      const next = current.includes(column)
        ? current.filter((value) => value !== column)
        : [...current, column];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function visible(column: OptionalColumn) {
    return visibleColumns.includes(column);
  }

  const columnCount = 3 + visibleColumns.length;
  const minWidth = Math.max(640, 430 + visibleColumns.length * 125);

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <div className="relative w-fit sm:ml-auto" ref={chooserRef}>
          <button
            type="button"
            aria-expanded={chooserOpen}
            aria-haspopup="menu"
            onClick={() => setChooserOpen((open) => !open)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ColumnsIcon />
            Columns
          </button>
          {chooserOpen && (
            <div
              role="menu"
              className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl shadow-navy/10 sm:left-auto sm:right-0"
            >
              <p className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                Visible columns
              </p>
              <div className="mt-2 space-y-1">
                {columnOptions.map((column) => (
                  <label
                    key={column.id}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={visible(column.id)}
                      onChange={() => toggleColumn(column.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    {column.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 border-t border-gray-100 px-1 pt-2 text-[10px] leading-4 text-gray-400">
                Name, role, and actions always remain visible.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table
          className="w-full text-left text-sm"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead className="border-b border-gray-100 bg-gray-50/60 text-[10px] uppercase tracking-[0.12em] text-gray-500">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              {visible("email") && (
                <th className="px-3 py-2.5 font-semibold">Email</th>
              )}
              {visible("skill") && (
                <th className="px-3 py-2.5 font-semibold">Skill</th>
              )}
              <th className="px-3 py-2.5 font-semibold">Role</th>
              {visible("partnerStatus") && (
                <th className="px-3 py-2.5 font-semibold">Partner status</th>
              )}
              {visible("lastLogin") && (
                <th className="px-3 py-2.5 font-semibold">Last login</th>
              )}
              {visible("loginCount") && (
                <th className="px-3 py-2.5 text-right font-semibold">
                  Logins
                </th>
              )}
              {visible("joined") && (
                <th className="px-3 py-2.5 font-semibold">Joined</th>
              )}
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  No users found.
                </td>
              </tr>
            )}
            {users.map((user) => {
              const isSelf = user.id === adminId;
              return (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        src={user.image}
                        name={user.name ?? user.email}
                        size={30}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">
                          {user.name ?? "—"}
                          {isSelf && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">
                              (you)
                            </span>
                          )}
                        </div>
                        {user.playerName && (
                          <div className="text-[11px] text-gray-400">
                            {user.playerName}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {visible("email") && (
                    <td className="px-3 py-2.5 text-gray-600">
                      {user.email}
                      {user.facebookPage && (
                        <a
                          href={user.facebookPage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 block max-w-52 truncate text-[11px] text-primary hover:underline"
                        >
                          {facebookPageLabel(user.facebookPage)}
                        </a>
                      )}
                    </td>
                  )}
                  {visible("skill") && (
                    <td className="px-3 py-2.5 text-gray-600">
                      {user.role === "PARTNER"
                        ? "—"
                        : skillLabel(user.skillLevel)}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <RoleSelect
                      userId={user.id}
                      role={user.role}
                      disabled={isSelf}
                    />
                  </td>
                  {visible("partnerStatus") && (
                    <td className="px-3 py-2.5">
                      {user.role === "PARTNER" ? (
                        <Badge
                          tone={
                            user.partnerStatus === "ACTIVE"
                              ? "success"
                              : user.partnerStatus === "DRAFT"
                                ? "neutral"
                                : "warn"
                          }
                        >
                          {user.partnerStatus === "ACTIVE"
                            ? "Verified"
                            : user.partnerStatus === "DRAFT"
                              ? "Draft"
                              : "Pending review"}
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {visible("lastLogin") && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                      {formatLoginDate(user.lastLoginAt)}
                    </td>
                  )}
                  {visible("loginCount") && (
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-navy">
                      {user.loginCount.toLocaleString("en-PH")}
                    </td>
                  )}
                  {visible("joined") && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {user.role === "PARTNER" && (
                        <>
                          <form action={startPartnerImpersonationAction}>
                            <input
                              type="hidden"
                              name="partnerId"
                              value={user.id}
                            />
                            <button
                              type="submit"
                              title={`Assist ${user.name ?? user.email}`}
                              className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
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
                        className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
                      >
                        Edit
                      </Link>
                      {!isSelf && (
                        <DeleteUserButton
                          userId={user.id}
                          name={user.name ?? user.email}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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
