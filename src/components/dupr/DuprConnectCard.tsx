"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { DuprRatingBadge } from "@/components/dupr/DuprRatingBadge";
import {
  disconnectDuprAccountAction,
  linkDuprAccountAction,
  type DuprActionState,
} from "@/lib/dupr-actions";
import {
  duprIdFromConsentMessage,
  formatDuprRating,
  type DuprRatingView,
} from "@/lib/dupr-shared";

const initialState: DuprActionState = {};

export function DuprConnectCard({
  sso,
  link,
  consentLost,
  updatedAt,
  assisting,
}: {
  // DUPR's consent page, or null while DUPR isn't configured.
  sso: { url: string; origin: string } | null;
  link: DuprRatingView | null;
  consentLost: boolean;
  updatedAt: string | null;
  assisting: boolean;
}) {
  const [linkState, linkAction, linking] = useActionState(
    linkDuprAccountAction,
    initialState
  );
  const [unlinkState, unlinkAction, unlinking] = useActionState(
    disconnectDuprAccountAction,
    initialState
  );
  const [waiting, setWaiting] = useState(false);
  const popup = useRef<Window | null>(null);

  // Only messages from DUPR's own origin, sent by the window this card opened,
  // are read. The server still verifies the DUPR ID with DUPR before linking.
  useEffect(() => {
    if (!sso) return;
    const origin = sso.origin;
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      if (popup.current && event.source !== popup.current) return;
      const duprId = duprIdFromConsentMessage(event.data);
      if (!duprId) return;
      popup.current?.close();
      popup.current = null;
      setWaiting(false);
      const formData = new FormData();
      formData.set("duprId", duprId);
      startTransition(() => linkAction(formData));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sso, linkAction]);

  function connect() {
    if (!sso) return;
    popup.current = window.open(
      sso.url,
      "dupr-connect",
      "popup,width=480,height=760"
    );
    setWaiting(Boolean(popup.current));
  }

  const message = linkState.message ?? unlinkState.message;
  const success = linkState.success ?? unlinkState.success;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-navy">DUPR rating</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Connect your DUPR account to show your rating on your profile,
            event rosters, and BunalQ, and to balance open-play teams.
          </p>
        </div>
        {link && (
          <DuprRatingBadge rating={link} className="text-sm" />
        )}
      </div>

      {message && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}
      {success && !message && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      )}

      {link ? (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-semibold text-gray-500">DUPR ID</dt>
              <dd className="mt-1 font-bold text-navy">{link.duprId}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-semibold text-gray-500">Doubles</dt>
              <dd className="mt-1 font-bold text-navy">
                {formatDuprRating(link.doubles)}
                {link.doubles != null && !link.doublesReliable && (
                  <span className="ml-1 text-xs font-medium text-gray-400">provisional</span>
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-semibold text-gray-500">Singles</dt>
              <dd className="mt-1 font-bold text-navy">
                {formatDuprRating(link.singles)}
                {link.singles != null && !link.singlesReliable && (
                  <span className="ml-1 text-xs font-medium text-gray-400">provisional</span>
                )}
              </dd>
            </div>
          </dl>
          {consentLost ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              DUPR stopped sharing your rating with Bunal.club, so it is no
              longer updating. Reconnect to resume.
            </p>
          ) : (
            updatedAt && (
              <p className="text-xs text-gray-400">
                Updated {new Date(updatedAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Manila",
                })}. Ratings refresh daily from DUPR.
              </p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {consentLost && sso && !assisting && (
              <button
                type="button"
                onClick={connect}
                disabled={linking}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Reconnect DUPR
              </button>
            )}
            {!assisting && (
              <form action={unlinkAction}>
                <button
                  type="submit"
                  disabled={unlinking}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {unlinking ? "Disconnecting…" : "Disconnect"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : !sso ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-gray-500">
          DUPR connection is coming soon.
        </p>
      ) : assisting ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-gray-500">
          Only the player can connect their DUPR account.
        </p>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            onClick={connect}
            disabled={linking}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {linking ? "Connecting…" : "Connect DUPR"}
          </button>
          {waiting && !linking && (
            <p className="mt-2 text-xs text-gray-500">
              Finish signing in on DUPR in the window that opened.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
