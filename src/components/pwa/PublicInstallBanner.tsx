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

function subscribeToHydration() {
  return () => undefined;
}

function getTrueClientSnapshot() {
  return true;
}

function getFalseServerSnapshot() {
  return false;
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSAL_KEY));
    return (
      Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISSAL_MS
    );
  } catch {
    return false;
  }
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function PhoneIcon() {
  return (
    <svg
      className="h-5 w-5"
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
  );
}

function ShareIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v7h14v-7" />
    </svg>
  );
}

export function PublicInstallBanner() {
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
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getTrueClientSnapshot,
    getFalseServerSnapshot
  );
  const [dismissed, setDismissed] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const ios = hydrated && isIosDevice();
  const recentlyDismissed = hydrated && wasRecentlyDismissed();

  if (
    !hydrated ||
    !mobile ||
    standalone ||
    dismissed ||
    recentlyDismissed ||
    (!installPrompt && !ios)
  ) {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSAL_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable in hardened or private browsing modes.
    }
    setDismissed(true);
    setInstructionsOpen(false);
  }

  async function install() {
    if (!installPrompt) {
      setInstructionsOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") setDismissed(true);
  }

  return (
    <>
      <aside
        aria-label="Install Bunal.club"
        className="fixed inset-x-4 z-[80] mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-3 shadow-2xl shadow-navy/20 md:hidden"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-soft text-navy">
          <PhoneIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold text-navy min-[360px]:text-sm">
            Add Bunal.club
          </p>
          <p className="hidden truncate text-xs text-slate-500 min-[360px]:block">
            Open it like an app
          </p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover min-[360px]:px-4"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss app install prompt"
          className="flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-navy min-[360px]:w-8"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </aside>

      {instructionsOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end bg-navy/55 p-4 backdrop-blur-sm md:hidden"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setInstructionsOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-instructions-title"
            className="mx-auto w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl shadow-black/30"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <ShareIcon />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="install-instructions-title"
                  className="text-lg font-black text-navy"
                >
                  Add Bunal.club on iPhone or iPad
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Apple requires this quick Home Screen step.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInstructionsOpen(false)}
                aria-label="Close install instructions"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-navy"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <ol className="mt-5 space-y-3 text-sm text-slate-600">
              {[
                "Open Bunal.club in Safari.",
                "Tap the Share button in Safari's toolbar.",
                "Choose Add to Home Screen, then tap Add.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span className="pt-1 leading-5">{step}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setInstructionsOpen(false)}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Got it
            </button>
          </section>
        </div>
      )}
    </>
  );
}
