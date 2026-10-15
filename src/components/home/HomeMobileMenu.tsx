"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { Logo } from "@/components/Logo";

// The homepage header only fits its full navigation at `lg`; below that every
// link lives in this drawer so phones reach the same pages as desktop. The
// drawer is portalled to <body> because the header's backdrop blur would
// otherwise become the containing block for its fixed positioning.
export function HomeMobileMenu({
  links,
  accountHref,
  accountLabel,
}: {
  links: readonly (readonly [label: string, href: string])[];
  accountHref: string;
  accountLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousOverflowRef = useRef<string | null>(null);
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      unlockBodyScroll(previousOverflowRef);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function closeMenu({ restoreFocus = false } = {}) {
    // Unlock now rather than in the effect cleanup: Next scrolls to an
    // in-page hash before that cleanup runs, and a locked body won't move.
    unlockBodyScroll(previousOverflowRef);
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open menu"
        aria-controls="home-mobile-menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft lg:hidden"
      >
        <MenuIcon />
      </button>

      {mounted &&
        createPortal(
          <>
            <div
              aria-hidden="true"
              onClick={() => closeMenu({ restoreFocus: true })}
              className={`fixed inset-0 z-[60] bg-navy/60 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
                open
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />

            <aside
              ref={drawerRef}
              id="home-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              aria-hidden={!open}
              inert={!open}
              onKeyDown={trapFocus}
              className={`fixed inset-y-0 right-0 z-[70] flex w-[min(84vw,340px)] min-w-0 flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
                open ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <Link
                  href="/"
                  aria-label="Bunal.club homepage"
                  onClick={() => closeMenu()}
                >
                  <Logo />
                </Link>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="Close menu"
                  onClick={() => closeMenu({ restoreFocus: true })}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  <CloseIcon />
                </button>
              </div>

              <nav
                aria-label="Mobile main navigation"
                className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
              >
                {links.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => closeMenu()}
                    className="flex min-h-12 items-center rounded-xl px-4 py-3 text-base font-semibold text-navy transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    {label}
                  </Link>
                ))}
              </nav>

              <div className="space-y-2 border-t border-slate-200 p-4">
                <Link
                  href="/hubs"
                  onClick={() => closeMenu()}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
                >
                  Browse courts
                </Link>
                <Link
                  href={accountHref}
                  onClick={() => closeMenu()}
                  className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-navy transition-colors hover:bg-slate-50"
                >
                  {accountLabel}
                </Link>
              </div>
            </aside>
          </>,
          document.body
        )}
    </>
  );
}

function unlockBodyScroll(previousOverflow: RefObject<string | null>) {
  if (previousOverflow.current === null) return;
  document.body.style.overflow = previousOverflow.current;
  previousOverflow.current = null;
}

function subscribeNoop() {
  return () => {};
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
