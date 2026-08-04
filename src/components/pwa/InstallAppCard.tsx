"use client";

import { useState, useSyncExternalStore } from "react";

import { usePwa } from "@/components/pwa/PwaProvider";

const DISMISSAL_KEY = "bunal.pwa-install-dismissed-at";
const DISMISSAL_MS = 30 * 24 * 60 * 60 * 1_000;
const mobileQuery = "(max-width: 767px)";
const standaloneQuery = "(display-mode: standalone)";

function subscribeToMobileView(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getMobileViewSnapshot() {
  return window.matchMedia(mobileQuery).matches;
}

function subscribeToStandaloneMode(onChange: () => void) {
  const query = window.matchMedia(standaloneQuery);
  query.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function getStandaloneSnapshot() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia(standaloneQuery).matches ||
    navigatorWithStandalone.standalone === true
  );
}

function getFalseServerSnapshot() {
  return false;
}

function wasRecentlyDismissed() {
  if (typeof window === "undefined") return true;
  const dismissedAt = Number(window.localStorage.getItem(DISMISSAL_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISSAL_MS;
}

export function InstallAppCard() {
  const { installPrompt, promptInstall } = usePwa();
  const mobile = useSyncExternalStore(
    subscribeToMobileView,
    getMobileViewSnapshot,
    getFalseServerSnapshot
  );
  const standalone = useSyncExternalStore(
    subscribeToStandaloneMode,
    getStandaloneSnapshot,
    getFalseServerSnapshot
  );
  const [dismissed, setDismissed] = useState(wasRecentlyDismissed);
  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!mobile || standalone || dismissed || (!installPrompt && !isIos)) {
    return null;
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSAL_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-soft text-navy">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M10 18h4" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-navy">
            Add Bunal.club to your home screen
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isIos
              ? "In Safari, tap Share, then choose Add to Home Screen."
              : "Launch bookings faster in a focused, app-like window."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {installPrompt && (
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-navy"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
