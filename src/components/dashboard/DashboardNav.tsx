"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PartnerStatus, Role } from "@prisma/client";

import { Logo } from "@/components/Logo";
import { DashboardIcon } from "@/components/dashboard/DashboardIcon";
import {
  dashboardPathMatches,
  getDashboardNavigationItems,
  type DashboardNavigationItem,
} from "@/components/dashboard/DashboardNavigation";
import { Avatar } from "@/components/ui/Avatar";
import { logoutAction } from "@/lib/actions";
import type { PartnerWorkspace } from "@/lib/staffing-shared";

export function DashboardNav({
  role,
  partnerStatus,
  displayName,
  email,
  image,
  workspaceLabel,
  hasMessages = false,
  workspace,
}: {
  role: Role;
  partnerStatus: PartnerStatus | null;
  displayName: string;
  email: string;
  image: string | null;
  workspaceLabel: string;
  hasMessages?: boolean;
  workspace?: PartnerWorkspace | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const laptopMoreRef = useRef<HTMLDivElement>(null);
  const wideMoreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const laptopMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const wideMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  const items = getDashboardNavigationItems({
    role,
    partnerStatus,
    hasMessages,
    workspace,
  }).filter((item) => !item.accountOnly);
  const laptopPrimary = items.slice(0, 4);
  const widePrimary = items.slice(4, 6);
  const laptopOverflow = items.slice(4);
  const wideOverflow = items.slice(6);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !laptopMoreRef.current?.contains(target) &&
        !wideMoreRef.current?.contains(target)
      ) {
        setMoreOpen(false);
      }
      if (!accountRef.current?.contains(target)) {
        setAccountOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
        return;
      }
      if (moreOpen) {
        setMoreOpen(false);
        const visibleTrigger =
          wideMoreTriggerRef.current?.offsetParent !== null
            ? wideMoreTriggerRef.current
            : laptopMoreTriggerRef.current;
        visibleTrigger?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, moreOpen]);

  function toggleMore() {
    setMoreOpen((open) => !open);
    setAccountOpen(false);
  }

  function toggleAccount() {
    setAccountOpen((open) => !open);
    setMoreOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 hidden border-b border-slate-200 bg-white/95 shadow-[0_1px_0_rgba(16,36,58,0.02)] backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-[76px] w-full max-w-[1600px] items-center gap-4 px-6 xl:px-8">
        <Link
          href="/dashboard"
          aria-label="Bunal.club dashboard home"
          className="flex shrink-0 items-center pr-1"
        >
          <Logo />
        </Link>

        <nav
          aria-label="Dashboard navigation"
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          {laptopPrimary.map((item) => (
            <DesktopNavigationLink
              key={item.href}
              item={item}
              active={dashboardPathMatches(pathname, item)}
            />
          ))}
          {widePrimary.map((item) => (
            <DesktopNavigationLink
              key={item.href}
              item={item}
              active={dashboardPathMatches(pathname, item)}
              className="hidden xl:inline-flex"
            />
          ))}

          {laptopOverflow.length > 0 && (
            <div ref={laptopMoreRef} className="relative xl:hidden">
              <MoreButton
                ref={laptopMoreTriggerRef}
                open={moreOpen}
                active={laptopOverflow.some((item) =>
                  dashboardPathMatches(pathname, item)
                )}
                controls="dashboard-more-menu-laptop"
                onClick={toggleMore}
              />
              {moreOpen && (
                <NavigationMenu
                  id="dashboard-more-menu-laptop"
                  items={laptopOverflow}
                  pathname={pathname}
                  onNavigate={() => setMoreOpen(false)}
                />
              )}
            </div>
          )}

          {wideOverflow.length > 0 && (
            <div ref={wideMoreRef} className="relative hidden xl:block">
              <MoreButton
                ref={wideMoreTriggerRef}
                open={moreOpen}
                active={wideOverflow.some((item) =>
                  dashboardPathMatches(pathname, item)
                )}
                controls="dashboard-more-menu-wide"
                onClick={toggleMore}
              />
              {moreOpen && (
                <NavigationMenu
                  id="dashboard-more-menu-wide"
                  items={wideOverflow}
                  pathname={pathname}
                  onNavigate={() => setMoreOpen(false)}
                />
              )}
            </div>
          )}
        </nav>

        <div ref={accountRef} className="relative shrink-0">
          <button
            ref={accountTriggerRef}
            type="button"
            aria-label={`Open account menu for ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-controls="dashboard-account-menu"
            onClick={toggleAccount}
            className={`flex min-h-12 items-center gap-3 rounded-2xl border bg-white px-2.5 py-1.5 transition-colors ${
              accountOpen
                ? "border-primary/30 bg-primary-soft/40"
                : "border-slate-200 hover:border-primary/30 hover:bg-[#f7faf8]"
            }`}
          >
            <Avatar src={image} name={displayName} size={36} />
            <span className="hidden min-w-0 2xl:block">
              <span className="block max-w-36 truncate text-left text-sm font-bold text-navy">
                {displayName}
              </span>
              <span className="block max-w-36 truncate text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {workspaceLabel}
              </span>
            </span>
            <ChevronIcon open={accountOpen} />
          </button>

          {accountOpen && (
            <div
              id="dashboard-account-menu"
              role="menu"
              className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-navy/10"
            >
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="truncate text-sm font-bold text-navy">
                  {displayName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{email}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  {workspaceLabel}
                </p>
              </div>
              <Link
                href="/dashboard/account"
                role="menuitem"
                onClick={() => setAccountOpen(false)}
                className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-navy"
              >
                <DashboardIcon
                  name="account"
                  className="h-[18px] w-[18px] text-slate-400"
                />
                Account Settings
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-navy"
                >
                  <LogoutIcon />
                  Log out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DesktopNavigationLink({
  item,
  active,
  className = "inline-flex",
}: {
  item: DashboardNavigationItem;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${className} min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary-soft text-primary"
          : "text-slate-600 hover:bg-slate-50 hover:text-navy"
      }`}
    >
      <DashboardIcon name={item.icon} className="h-[17px] w-[17px]" />
      <span>{item.label}</span>
    </Link>
  );
}

function MoreButton({
  ref,
  open,
  active,
  controls,
  onClick,
}: {
  ref: Ref<HTMLButtonElement>;
  open: boolean;
  active: boolean;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
        active || open
          ? "bg-primary-soft text-primary"
          : "text-slate-600 hover:bg-slate-50 hover:text-navy"
      }`}
    >
      <DashboardIcon name="more" className="h-[17px] w-[17px]" />
      <span>More</span>
      <ChevronIcon open={open} />
    </button>
  );
}

function NavigationMenu({
  id,
  items,
  pathname,
  onNavigate,
}: {
  id: string;
  items: DashboardNavigationItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div
      id={id}
      role="menu"
      className="absolute left-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-navy/10"
    >
      {items.map((item) => {
        const active = dashboardPathMatches(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
              active
                ? "bg-primary-soft text-primary"
                : "text-slate-700 hover:bg-slate-50 hover:text-navy"
            }`}
          >
            <DashboardIcon
              name={item.icon}
              className={`h-[18px] w-[18px] ${
                active ? "text-primary" : "text-slate-400"
              }`}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-slate-400"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
