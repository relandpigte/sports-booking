"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  isOnline: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  promptInstall: () => Promise<"accepted" | "dismissed" | null>;
};

const PwaContext = createContext<PwaContextValue | null>(null);

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineSnapshot,
    getOnlineServerSnapshot
  );
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    }

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function clearInstallPrompt() {
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      isOnline,
      installPrompt,
      async promptInstall() {
        if (!installPrompt) return null;
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") setInstallPrompt(null);
        return choice.outcome;
      },
    }),
    [installPrompt, isOnline]
  );

  return (
    <PwaContext.Provider value={value}>
      {!isOnline && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[100] bg-amber-400 px-4 py-2 text-center text-xs font-bold text-amber-950 shadow-md"
        >
          You&apos;re offline. Reconnect to refresh availability or change a
          booking.
        </div>
      )}
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside PwaProvider.");
  return value;
}
